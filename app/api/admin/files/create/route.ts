import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  getCurrentUser,
  isAccountManager,
  isAdminOrSuper,
  isProduction,
  isSalesManager,
} from '../../_utils';
import { validateFile } from '@/lib/files/validation';
import { isTenantStoragePath } from '@/lib/storage/paths';
import { checkStorageLimit, storageLimitResponseBody } from '@/lib/billing/storage-limit';

export const runtime = 'nodejs';

const FILE_CATEGORIES = ['Draft', 'Revision', 'Final', 'Asset', 'Other'] as const;

type ProjectDoc = {
  projectName?: string;
  clientId?: string;
  clientName?: string;
  createdByUid?: string;
  ownerAmUid?: string | null;
  productionUid?: string | null;
  isDeleted?: boolean;
  tenantId?: string;
};

function canUpload(role: string) {
  const r = (role || '').toLowerCase();
  return isAdminOrSuper(r) || isSalesManager(r) || isAccountManager(r) || isProduction(r);
}

function cleanString(value: any) {
  return String(value || '').trim();
}

function emitFileUploadedEvent(payload: {
  projectId: string;
  category: string;
  uploadedByRole: string;
  uploadedByUid: string;
  timestamp: string;
}) {
  console.info('FILE_UPLOADED', payload);
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!canUpload(me.role)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const projectId = cleanString(body?.projectId);
    const category = cleanString(body?.category);
    const fileName = cleanString(body?.fileName);
    const storagePath = cleanString(body?.storagePath);
    const downloadUrl = cleanString(body?.downloadUrl);
    const fileId = cleanString(body?.id) || null;

    if (!projectId) {
      return NextResponse.json({ ok: false, error: 'Project is required.' }, { status: 400 });
    }

    if (!FILE_CATEGORIES.includes(category as (typeof FILE_CATEGORIES)[number])) {
      return NextResponse.json({ ok: false, error: 'Invalid category.' }, { status: 400 });
    }

    if (!fileName) {
      return NextResponse.json({ ok: false, error: 'File name is required.' }, { status: 400 });
    }

    const fileValidation = validateFile(fileName, Number(body?.size || 0));
    if (!fileValidation.valid) {
      return NextResponse.json({ ok: false, error: fileValidation.error }, { status: 400 });
    }

    if (!storagePath || !downloadUrl) {
      return NextResponse.json(
        { ok: false, error: 'Storage details are required.' },
        { status: 400 },
      );
    }

    if (!isTenantStoragePath(storagePath, me.tenantId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid storage path.' },
        { status: 400 },
      );
    }

    const projectSnap = await adminDb.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
    }

    const project = projectSnap.data() as ProjectDoc;
    if (project?.isDeleted) {
      return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
    }

    if (project?.tenantId !== me.tenantId && (me.role || '').toLowerCase() !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
    }

    const role = (me.role || '').toLowerCase();
    if (isAccountManager(role)) {
      if (project.ownerAmUid !== me.uid && project.createdByUid !== me.uid) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    if (isProduction(role)) {
      if (project.productionUid !== me.uid) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = fileId
      ? adminDb.collection('files').doc(fileId)
      : adminDb.collection('files').doc();

    const size = Number(body?.size || 0);

    const storageCheck = await checkStorageLimit(me.tenantId, size);
    if (!storageCheck.ok) {
      return NextResponse.json(storageLimitResponseBody(storageCheck), { status: 403 });
    }
    const mimeType = cleanString(body?.mimeType);
    const version = body?.version ? String(body.version).trim() : null;
    const notes = body?.notes ? String(body.notes).trim() : null;

    const previousSnap = await adminDb
      .collection('files')
      .where('tenantId', '==', me.tenantId)
      .where('projectId', '==', projectId)
      .where('category', '==', category)
      .where('isDeleted', '==', false)
      .where('isLatest', '==', true)
      .limit(25)
      .get();

    if (!previousSnap.empty) {
      const batch = adminDb.batch();
      previousSnap.docs.forEach((doc) => {
        batch.update(doc.ref, { isLatest: false, updatedAt: now });
      });
      await batch.commit();
    }

    const payload = {
      id: docRef.id,
      projectId,
      projectName: cleanString(project.projectName || ''),
      clientId: cleanString(project.clientId || ''),
      clientName: cleanString(project.clientName || ''),
      category,
      fileName,
      storagePath,
      downloadUrl,
      size,
      mimeType,
      uploadedByUid: me.uid,
      uploadedByName: cleanString(me.name || me.fullName || me.displayName || ''),
      uploadedByRole: cleanString(me.role || ''),
      version,
      notes,
      isLatest: true,
      isDeleted: false,
      tenantId: me.tenantId,
      uploadedAt: now,
      updatedAt: now,
    };

    await docRef.set(payload, { merge: true });

    emitFileUploadedEvent({
      projectId,
      category,
      uploadedByRole: cleanString(me.role || ''),
      uploadedByUid: me.uid,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error('files/create error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError
      ? 'Missing Firestore index.'
      : 'Unable to upload file right now.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
