import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminOrSuper } from '@/app/api/admin/_utils';
import type { Document, Folder } from '@/types/documents';

export const runtime = 'nodejs';

function canMove(document: Document, user: { uid: string; role: string }) {
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
    const destinationFolderId = (body?.folderId as string | null) || null;

    if (documentIds.length === 0) {
      return NextResponse.json({ error: 'No documents provided' }, { status: 400 });
    }

    let destinationFolder: Folder | null = null;
    if (destinationFolderId) {
      const folderDoc = await adminDb.collection('folders').doc(destinationFolderId).get();
      if (!folderDoc.exists) {
        return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
      }
      destinationFolder = folderDoc.data() as Folder;
      if (destinationFolder.tenantId !== session.tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
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
      if (doc.tenantId !== session.tenantId || !canMove(doc, session)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const now = admin.firestore.Timestamp.now();
    const batch = adminDb.batch();

    const folderTotals = new Map<string, { count: number; size: number }>();

    for (const doc of documents) {
      const sourceFolderId = doc.folderId || null;

      if (sourceFolderId && sourceFolderId !== destinationFolderId) {
        const current = folderTotals.get(sourceFolderId) || { count: 0, size: 0 };
        folderTotals.set(sourceFolderId, {
          count: current.count - 1,
          size: current.size - doc.fileSize,
        });
      }

      if (destinationFolderId && sourceFolderId !== destinationFolderId) {
        const current = folderTotals.get(destinationFolderId) || { count: 0, size: 0 };
        folderTotals.set(destinationFolderId, {
          count: current.count + 1,
          size: current.size + doc.fileSize,
        });
      }

      batch.update(adminDb.collection('documents').doc(doc.id), {
        folderId: destinationFolderId,
        folderPath: destinationFolder?.path || null,
        updatedAt: now,
      });
    }

    for (const [folderId, totals] of folderTotals) {
      batch.update(adminDb.collection('folders').doc(folderId), {
        documentCount: admin.firestore.FieldValue.increment(totals.count),
        totalSize: admin.firestore.FieldValue.increment(totals.size),
        updatedAt: now,
      });
    }

    await batch.commit();

    return NextResponse.json({ ok: true, moved: documents.length });
  } catch (error) {
    console.error('Error moving documents:', error);
    return NextResponse.json({ error: 'Failed to move documents' }, { status: 500 });
  }
}
