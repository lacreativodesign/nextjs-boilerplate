import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminOrSuper } from '@/app/api/admin/_utils';
import { StorageService } from '@/lib/storage/storage-service';
import type { Document } from '@/types/documents';

export const runtime = 'nodejs';

function canDelete(document: Document, user: { uid: string; role: string }) {
  if (document.uploadedBy === user.uid) return true;
  return isAdminOrSuper(user.role);
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const documentIds = Array.isArray(body?.documentIds) ? body.documentIds : [];

    if (documentIds.length === 0) {
      return NextResponse.json({ error: 'No documents provided' }, { status: 400 });
    }

    const chunks: string[][] = [];
    for (let i = 0; i < documentIds.length; i += 10) {
      chunks.push(documentIds.slice(i, i + 10));
    }

    const documents: Document[] = [];
    for (const chunk of chunks) {
      const snapshot = await adminDb
        .collection('documents')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      snapshot.docs.forEach((doc) => documents.push({ id: doc.id, ...doc.data() } as Document));
    }

    for (const doc of documents) {
      if (doc.tenantId !== session.tenantId || !canDelete(doc, session)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    for (const doc of documents) {
      await StorageService.deleteFile(doc.id);
    }

    return NextResponse.json({ ok: true, deleted: documents.length });
  } catch (error) {
    console.error('Error deleting documents:', error);
    return NextResponse.json({ error: 'Failed to delete documents' }, { status: 500 });
  }
}
