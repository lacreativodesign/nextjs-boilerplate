/**
 * Magic-byte (content signature) validation for uploaded files.
 *
 * SEC-006 / SEC-004: lib/files/validation.ts trusted the filename extension and the
 * client-declared MIME type. Neither is evidence of anything — a caller renames
 * payload.exe to payload.pdf and the old validator accepted it.
 *
 * This module inspects the ACTUAL leading bytes of the assembled buffer and requires
 * them to agree with the claimed extension. Formats with no reliable signature (plain
 * text and CSV) are allowed through by design, but only after the buffer has been
 * proven not to start with any executable/script signature.
 */

export type SignatureCheck = { valid: true } | { valid: false; error: string };

type Signature = {
  /** Byte prefix, or null for a format checked by a custom matcher. */
  bytes: number[] | null;
  offset?: number;
  match?: (buffer: Buffer) => boolean;
};

const ZIP: Signature = { bytes: [0x50, 0x4b] }; // PK.. — zip, docx, xlsx, pptx, odt, ods
const OLE: Signature = { bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }; // legacy Office

/** Extension -> accepted signatures. An empty array means "no reliable signature". */
const SIGNATURES: Record<string, Signature[]> = {
  pdf: [{ bytes: [0x25, 0x50, 0x44, 0x46] }],
  jpg: [{ bytes: [0xff, 0xd8, 0xff] }],
  jpeg: [{ bytes: [0xff, 0xd8, 0xff] }],
  png: [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  gif: [{ bytes: [0x47, 0x49, 0x46, 0x38] }],
  bmp: [{ bytes: [0x42, 0x4d] }],
  webp: [
    {
      bytes: null,
      match: (buffer) =>
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
        buffer.subarray(8, 12).toString('latin1') === 'WEBP',
    },
  ],
  zip: [ZIP],
  docx: [ZIP],
  xlsx: [ZIP],
  pptx: [ZIP],
  odt: [ZIP],
  ods: [ZIP],
  doc: [OLE],
  xls: [OLE],
  ppt: [OLE],
  psd: [{ bytes: [0x38, 0x42, 0x50, 0x53] }],
  rar: [
    { bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00] },
    { bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00] },
  ],
  ai: [{ bytes: [0x25, 0x50, 0x44, 0x46] }, { bytes: [0x25, 0x21, 0x50, 0x53] }],
  eps: [{ bytes: [0x25, 0x21, 0x50, 0x53] }, { bytes: [0xc5, 0xd0, 0xd3, 0xc6] }],
  fig: [],
  sketch: [ZIP],
  rtf: [{ bytes: [0x7b, 0x5c, 0x72, 0x74, 0x66] }],
  txt: [],
  csv: [],
};

/** Signatures that are never acceptable for a user upload, whatever the extension says. */
const FORBIDDEN_SIGNATURES: Array<{ name: string; bytes: number[] }> = [
  { name: 'Windows executable', bytes: [0x4d, 0x5a] },
  { name: 'Linux ELF binary', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'macOS Mach-O binary', bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { name: 'macOS Mach-O binary', bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { name: 'Java class file', bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { name: 'shell script', bytes: [0x23, 0x21] },
];

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  for (let index = 0; index < bytes.length; index += 1) {
    if (buffer[offset + index] !== bytes[index]) return false;
  }
  return true;
}

function matches(buffer: Buffer, signature: Signature): boolean {
  if (signature.match) return signature.match(buffer);
  if (!signature.bytes) return false;
  return startsWith(buffer, signature.bytes, signature.offset ?? 0);
}

export function extensionOf(fileName: string): string {
  const parts = String(fileName || '').split('.');
  return parts.length > 1 ? String(parts.pop()).toLowerCase() : '';
}

/** True when the extension has no dependable magic number (plain text formats). */
export function extensionHasSignature(extension: string): boolean {
  const list = SIGNATURES[extension];
  return Array.isArray(list) && list.length > 0;
}

/**
 * Validates the assembled bytes against the claimed extension.
 * Fails closed: an unknown extension is rejected rather than waved through.
 */
export function validateSignature(buffer: Buffer, fileName: string): SignatureCheck {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { valid: false, error: 'Uploaded file is empty' };
  }

  for (const forbidden of FORBIDDEN_SIGNATURES) {
    if (startsWith(buffer, forbidden.bytes)) {
      return { valid: false, error: `File content is a ${forbidden.name} and cannot be uploaded` };
    }
  }

  const extension = extensionOf(fileName);
  const expected = SIGNATURES[extension];

  if (!expected) {
    return { valid: false, error: `File type .${extension || 'unknown'} is not supported` };
  }

  if (expected.length === 0) {
    // No dependable signature (txt, csv, fig). The forbidden-signature sweep above has
    // already rejected executables, which is the control that matters here.
    return { valid: true };
  }

  if (expected.some((signature) => matches(buffer, signature))) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `File content does not match the .${extension} file type it claims to be`,
  };
}
