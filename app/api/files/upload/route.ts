import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { FileManager } from '@/lib/files/file-manager';
import { validateFile } from '@/lib/files/validation';

export const runtime = 'nodejs';

// SEC-004 (partial): uploadId is used as a Firestore doc id AND as a server
// filesystem path segment, so it must be an opaque token with no separators.
// Chunk counts are bounded and chunkIndex must fall inside the declared range.
const MAX_TOTAL_CHUNKS = 2048;

const chunkSchema = z
  .object({
    uploadId: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/, 'uploadId must be an opaque token'),
    chunkIndex: z.coerce.number().int().min(0),
    totalChunks: z.coerce.number().int().min(1).max(MAX_TOTAL_CHUNKS),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    size: z.coerce.number().int().positive(),
    folderId: z.string().optional(),
    changes: z.string().max(500).optional(),
    fileId: z.string().optional(),
    visibility: z.enum(['private', 'team', 'public']).optional(),
  })
  .refine((value) => value.chunkIndex < value.totalChunks, {
    message: 'chunkIndex must be less than totalChunks',
    path: ['chunkIndex'],
  });

export async function POST(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const form = await request.formData();
    const payload = chunkSchema.parse({
      uploadId: form.get('uploadId'),
      chunkIndex: form.get('chunkIndex'),
      totalChunks: form.get('totalChunks'),
      fileName: form.get('fileName'),
      mimeType: form.get('mimeType'),
      size: form.get('size'),
      folderId: form.get('folderId') || undefined,
      changes: form.get('changes') || undefined,
      fileId: form.get('fileId') || undefined,
      visibility: form.get('visibility') || undefined,
    });

    const chunk = form.get('chunk') as File | null;
    if (!chunk) {
      return NextResponse.json({ error: 'Chunk is required' }, { status: 400 });
    }

    const fileValidation = validateFile(payload.fileName, payload.size);
    if (!fileValidation.valid) {
      return NextResponse.json({ error: fileValidation.error }, { status: 400 });
    }

    const result = await FileManager.initOrAppendChunk({
      tenantId: session.tenantId,
      uploadId: payload.uploadId,
      chunkIndex: payload.chunkIndex,
      totalChunks: payload.totalChunks,
      chunk: Buffer.from(await chunk.arrayBuffer()),
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      size: payload.size,
      userId: session.uid,
      userEmail: String(session.email || ''),
      folderId: payload.folderId,
      changes: payload.changes,
      fileId: payload.fileId,
      permissions: { visibility: payload.visibility },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('file upload failed', error);
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 });
  }
}
