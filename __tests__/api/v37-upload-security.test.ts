import fs from 'fs';
import path from 'path';
import { validateFile, validateAssembledFile } from '@/lib/files/validation';
import { validateSignature } from '@/lib/files/signatures';

/**
 * P0-2 — chunked upload and file-content security.
 *
 * The v37 upload path trusted the caller for everything that mattered: the uploadId became
 * a server filesystem path segment, totalChunks was unbounded, chunkIndex was never proven
 * to fall inside the declared range, the declared file size was never compared with the
 * assembled bytes, session metadata could change between chunks, SVG (an executable
 * document) was an allowed image type, and the managed-file store was not counted against
 * the tenant's plan storage quota at all.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
const SH = Buffer.from('#!/bin/sh\necho hi\n');

describe('P0-2: content signatures are checked, not filenames', () => {
  it('accepts a real PDF named .pdf', () => {
    expect(validateSignature(PDF, 'invoice.pdf')).toEqual({ valid: true });
  });

  it('rejects a Windows executable renamed to .pdf', () => {
    const result = validateSignature(EXE, 'invoice.pdf');
    expect(result.valid).toBe(false);
  });

  it('rejects an ELF binary renamed to .png', () => {
    expect(validateSignature(ELF, 'logo.png').valid).toBe(false);
  });

  it('rejects a shell script renamed to .csv even though csv has no signature', () => {
    expect(validateSignature(SH, 'data.csv').valid).toBe(false);
  });

  it('rejects a PNG whose bytes do not match its extension', () => {
    expect(validateSignature(PDF, 'logo.png').valid).toBe(false);
  });

  it('accepts a real PNG', () => {
    expect(validateSignature(PNG, 'logo.png')).toEqual({ valid: true });
  });

  it('rejects an empty buffer', () => {
    expect(validateSignature(Buffer.alloc(0), 'empty.pdf').valid).toBe(false);
  });

  it('rejects an extension it does not know', () => {
    expect(validateSignature(PDF, 'thing.wat').valid).toBe(false);
  });
});

describe('P0-2: SVG is no longer an allowed upload', () => {
  it('validateFile rejects .svg', () => {
    expect(validateFile('logo.svg', 1024).valid).toBe(false);
  });

  it('the allowed set no longer contains svg and the blocked set does', () => {
    const src = read('lib/files/validation.ts');
    const allowed = src.slice(src.indexOf('ALLOWED_EXTENSIONS'), src.indexOf('BLOCKED_EXTENSIONS'));
    expect(allowed).not.toContain("'svg'");
    const blocked = src.slice(src.indexOf('BLOCKED_EXTENSIONS'));
    expect(blocked).toContain("'svg'");
  });
});

describe('P0-2: assembled bytes are validated, not the declared size', () => {
  it('rejects when the real byte length differs from the declared size', () => {
    const result = validateAssembledFile(PDF, 'invoice.pdf', 999999);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/declared size/i);
  });

  it('accepts when the real byte length matches and the signature is right', () => {
    expect(validateAssembledFile(PDF, 'invoice.pdf', PDF.length)).toEqual({ valid: true });
  });

  it('enforces the size ceiling on the real buffer, not the declared value', () => {
    const oversized = Buffer.concat([PDF, Buffer.alloc(26 * 1024 * 1024)]);
    const result = validateAssembledFile(oversized, 'invoice.pdf', oversized.length);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/exceeds maximum/i);
  });
});

describe('P0-2: chunk session handling is bounded and bound to its opener', () => {
  const src = read('lib/files/file-manager.ts');

  it('rejects a chunkIndex outside the declared range', () => {
    expect(src).toContain('params.chunkIndex >= params.totalChunks');
  });

  it('caps totalChunks and the assembled byte total', () => {
    expect(src).toContain('MAX_TOTAL_CHUNKS');
    expect(src).toContain('MAX_ASSEMBLED_BYTES');
    expect(src).toContain('assembledBytes > MAX_ASSEMBLED_BYTES');
  });

  it('requires an opaque uploadId and proves the temp path stays under the approved root', () => {
    expect(src).toContain('SAFE_UPLOAD_ID');
    expect(src).toMatch(/const SAFE_UPLOAD_ID = \/\^\[A-Za-z0-9_-\]\{8,128\}\$\//);
    expect(src).toContain('tempDir.startsWith(tempRoot + path.sep)');
  });

  it('claims the session atomically instead of read-then-write', () => {
    expect(src).toContain('adminDb.runTransaction(async (tx) => {');
    expect(src.indexOf('runTransaction')).toBeLessThan(src.indexOf('await fs.mkdir(tempDir'));
  });

  it('binds the session to the tenant AND the user who opened it', () => {
    expect(src).toContain('data.tenantId !== params.tenantId || data.userId !== params.userId');
  });

  it('treats session metadata as immutable across chunks', () => {
    expect(src).toContain('data.totalChunks !== params.totalChunks');
    expect(src).toContain('data.fileName !== params.fileName');
    expect(src).toContain('data.size !== params.size');
    expect(src).toContain('Upload session metadata does not match the original request');
  });

  it('expires stale sessions instead of resuming them', () => {
    expect(src).toContain('CHUNK_SESSION_TTL_MS');
    expect(src).toContain('Upload session has expired');
  });

  it('validates the assembled buffer before anything is stored', () => {
    expect(src).toContain('validateAssembledFile(buffer, session.fileName, session.size)');
    expect(src.indexOf('validateAssembledFile')).toBeLessThan(src.indexOf('this.storeVersion({'));
  });

  it('charges quota on real bytes after assembly', () => {
    expect(src).toContain('checkStorageLimit(params.tenantId, buffer.length)');
    expect(src).toContain('size: buffer.length,');
    expect(src.indexOf('checkStorageLimit')).toBeLessThan(src.indexOf('this.storeVersion({'));
  });

  it('always releases temp bytes and the session record', () => {
    expect(src).toContain('await fs.rm(tempDir, { recursive: true, force: true }).catch');
    expect(src).toContain('purgeExpiredUploadSessions');
  });
});

describe('P0-2: the managed-file store counts against the plan quota', () => {
  const src = read('lib/billing/storage-limit.ts');

  it('sums erp_files with its own deletedAt convention', () => {
    expect(src).toContain("collection('erp_files')");
    expect(src).toContain("where('deletedAt', '==', null)");
  });

  it('includes managed-file bytes in total tenant usage', () => {
    expect(src).toContain('managedFileBytes');
    expect(src).toContain('fileBytes + hrDocumentBytes + managedFileBytes');
  });
});

describe('P0-2: the upload route reports caller errors as 4xx', () => {
  const src = read('app/api/files/upload/route.ts');

  it('maps UploadRejected to its own status', () => {
    expect(src).toContain('error instanceof UploadRejected');
    expect(src).toContain('{ status: error.status }');
  });

  it('maps a schema failure to 400', () => {
    expect(src).toContain("error?.name === 'ZodError'");
  });

  it('no longer echoes internal error messages on a 500', () => {
    expect(src).toContain("{ error: 'Upload failed' }");
    expect(src).not.toContain("error?.message || 'Upload failed'");
  });
});

describe('S3: buffer-in-hand upload routes validate the assembled bytes', () => {
  // Every route below receives the real file bytes on the server (multipart buffer or
  // decoded base64) and must run validateAssembledFile on that buffer — not on the
  // client-declared name/size — so a renamed executable or a size-spoofed payload is
  // rejected before it is stored or forwarded to an integration.
  const routes: Array<[string, string]> = [
    ['documents/upload', 'app/api/documents/upload/route.ts'],
    ['documents/[id]/version', 'app/api/documents/[id]/version/route.ts'],
    ['google drive upload', 'app/api/integrations/google/drive/upload/route.ts'],
    ['onedrive upload', 'app/api/integrations/microsoft/onedrive/upload/route.ts'],
  ];

  it.each(routes)('%s imports and calls validateAssembledFile', (_label, rel) => {
    const src = read(rel);
    expect(src).toContain("validateAssembledFile } from '@/lib/files/validation'");
    expect(src).toContain('validateAssembledFile(');
  });

  it('the base64 integration routes validate the DECODED buffer, not the raw string', () => {
    for (const rel of [
      'app/api/integrations/google/drive/upload/route.ts',
      'app/api/integrations/microsoft/onedrive/upload/route.ts',
    ]) {
      const src = read(rel);
      expect(src).toContain("Buffer.from(String(body.base64Content), 'base64')");
      expect(src).toContain('validateAssembledFile(decoded,');
    }
  });

  it('the multipart document routes validate the assembled buffer before storing', () => {
    for (const rel of [
      'app/api/documents/upload/route.ts',
      'app/api/documents/[id]/version/route.ts',
    ]) {
      const src = read(rel);
      expect(src.indexOf('validateAssembledFile(buffer')).toBeGreaterThan(-1);
      expect(src.indexOf('validateAssembledFile(buffer')).toBeLessThan(
        src.indexOf('StorageService.'),
      );
    }
  });
});
