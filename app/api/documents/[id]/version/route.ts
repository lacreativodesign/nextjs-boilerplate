import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminOrSuper } from '@/app/api/admin/_utils';
import { StorageService } from '@/lib/storage/storage-service';
import type { Document } from '@/types/documents';
import { validateFile, validateAssembledFile } from '@/lib/files/validation';

export const runtime = 'nodejs';

function canVersion(document: Document, user: { uid: string; role: string }) {
  if (document.uploadedBy === user.uid) return true;
  return isAdminOrSuper(user.role);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
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
    console.error('Error creating version:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create version' },
      { status: 500 },
    );
  }
}
