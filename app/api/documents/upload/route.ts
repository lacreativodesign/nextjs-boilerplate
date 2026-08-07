import { NextResponse } from 'next/server';
import { getCurrentUser, isAdminOrSuper } from '@/app/api/admin/_utils';
import { StorageService } from '@/lib/storage/storage-service';
import { adminDb } from '@/lib/firebaseAdmin';
import type { DocumentCategory, DocumentVisibility } from '@/types/documents';
import { validateFile, validateAssembledFile } from '@/lib/files/validation';

export const runtime = 'nodejs';

const ALLOWED_CATEGORIES: DocumentCategory[] = [
  'invoice',
  'receipt',
  'contract',
  'proposal',
  'report',
  'statement',
  'tax_document',
  'legal',
  'hr',
  'marketing',
  'other',
];

const ALLOWED_VISIBILITY: DocumentVisibility[] = ['private', 'team', 'public'];

function parseCategory(value: string | null): DocumentCategory {
  if (!value) return 'other';
  const normalized = value.trim().toLowerCase() as DocumentCategory;
  return ALLOWED_CATEGORIES.includes(normalized) ? normalized : 'other';
}

function parseVisibility(value: string | null): DocumentVisibility | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase() as DocumentVisibility;
  return ALLOWED_VISIBILITY.includes(normalized) ? normalized : undefined;
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = parseCategory(formData.get('category') as string | null);
    const folderId = (formData.get('folderId') as string | null) || undefined;
    const relatedResourceType = (formData.get('relatedResourceType') as string | null) || undefined;
    const relatedResourceId = (formData.get('relatedResourceId') as string | null) || undefined;
    const visibility = parseVisibility(formData.get('visibility') as string | null);
    const title = (formData.get('title') as string | null) || undefined;
    const description = (formData.get('description') as string | null) || undefined;
    const tagsRaw = (formData.get('tags') as string | null) || '';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileValidation = validateFile(file.name, file.size);
    if (!fileValidation.valid) {
      return NextResponse.json({ error: fileValidation.error }, { status: 400 });
    }

    if (folderId) {
      const folderDoc = await adminDb.collection('folders').doc(folderId).get();
      if (!folderDoc.exists) {
        return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
      }
      const folder = folderDoc.data();
      if (!folder || folder.tenantId !== session.tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (
        folder.visibility === 'private' &&
        folder.createdBy !== session.uid &&
        !isAdminOrSuper(session.role)
      ) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Content validation on the ASSEMBLED bytes: magic-byte signature must match the
    // claimed extension, and the real length must match the declared size. validateFile
    // above only saw the client-declared name and size; this is the gate that a renamed
    // executable or a size-spoofed upload cannot pass.
    const assembledCheck = validateAssembledFile(buffer, file.name, file.size);
    if (!assembledCheck.valid) {
      return NextResponse.json({ error: assembledCheck.error }, { status: 400 });
    }

    const tags = tagsRaw
      ? tagsRaw
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];

    const documentId = await StorageService.uploadFile({
      tenantId: session.tenantId,
      userId: session.uid,
      userEmail: session.email || '',
      file: buffer,
      fileName: file.name,
      mimeType: file.type,
      category,
      folderId,
      relatedResourceType,
      relatedResourceId,
      visibility,
      tags,
      title,
      description,
    });

    return NextResponse.json({
      documentId,
      message: 'File uploaded successfully',
    });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 });
  }
}
