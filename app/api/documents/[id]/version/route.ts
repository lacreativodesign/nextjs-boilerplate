import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminOrSuper } from '@/app/api/admin/_utils';
import { StorageService } from '@/lib/storage/storage-service';
import type { Document } from '@/types/documents';
import { validateFile, validateAssembledFile } from '@/lib/files/validation';
import { storageLimitResponseBody } from '@/lib/billing/storage-limit';
import { StorageLimitExceededError } from '@/lib/billing/storage-reservation';

export const runtime = 'nodejs';

function canVersion(document: Document, user: { uid: string; role: string }) {
  if (document.uploadedBy === user.uid) return true;
  return isAdminOrSuper(user.role);
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const originalDoc = await adminDb.collection('documents').doc(params.id).get();
    if (!originalDoc.exists) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const original = originalDoc.data() as Document;
    if (original.tenantId !== session.tenantId || !canVersion(original, session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileValidation = validateFile(file.name, file.size);
    if (!fileValidation.valid) {
      return NextResponse.json({ error: fileValidation.error }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate the assembled bytes (signature + real length) before storing a new version.
    const assembledCheck = validateAssembledFile(buffer, file.name, file.size);
    if (!assembledCheck.valid) {
      return NextResponse.json({ error: assembledCheck.error }, { status: 400 });
    }

    const newDocumentId = await StorageService.createVersion({
      tenantId: session.tenantId,
      userId: session.uid,
      userEmail: session.email || '',
      originalDocumentId: params.id,
      file: buffer,
      fileName: file.name,
      mimeType: file.type,
    });

    return NextResponse.json({ documentId: newDocumentId });
  } catch (error: any) {
    // A new version is a new physical object, so it is charged like any other upload.
    if (error instanceof StorageLimitExceededError) {
      return NextResponse.json(storageLimitResponseBody(error.check), { status: 403 });
    }
    console.error('Error creating version:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create version' },
      { status: 500 },
    );
  }
}
