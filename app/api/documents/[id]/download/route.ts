import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminOrSuper } from '@/app/api/admin/_utils';
import { StorageService } from '@/lib/storage/storage-service';
import type { Document } from '@/types/documents';

export const runtime = 'nodejs';

function hasDocumentAccess(document: Document, user: { uid: string; role: string }) {
  if (document.visibility === 'public' || document.visibility === 'team') {
    return true;
  }
  if (document.uploadedBy === user.uid) {
    return true;
  }
  if (document.sharedWith?.includes(user.uid)) {
    return true;
  }
  if (document.allowedRoles?.includes(user.role)) {
    return true;
  }
  return isAdminOrSuper(user.role);
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const doc = await adminDb.collection('documents').doc(params.id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const document = doc.data() as Document;
    if (document.tenantId !== session.tenantId || !hasDocumentAccess(document, session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Download-time virus-scan gate (defense in depth). A file the scanner flagged as
    // 'infected' must never be served, even though the upload path already refuses to store
    // one — this protects against a file that was flagged after storage (e.g. a scanner added
    // or updated later, or an async re-scan) and against any upload path that stored the
    // record without going through the upload-time gate. Only a definitive 'infected' verdict
    // blocks: 'unscanned'/'pending'/'failed'/'clean' remain downloadable, because most uploads
    // are stored without a scanner deployed and blocking those would break normal file access.
    if (document.virusScanStatus === 'infected') {
      return NextResponse.json(
        {
          error:
            'This file was flagged as malicious by a virus scan and cannot be downloaded. Contact your administrator.',
          code: 'file_infected',
        },
        { status: 403 },
      );
    }

    const downloadUrl = await StorageService.getDownloadUrl(params.id);

    return NextResponse.json({ downloadUrl });
  } catch (error) {
    console.error('Error generating download URL:', error);
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }
}
