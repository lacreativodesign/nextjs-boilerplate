import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireClient } from '../../_utils';
import {
  createNotification,
  createNotificationEvent,
  getUserIdsByRoles,
} from '@/lib/notifications';
import { validateFile } from '@/lib/files/validation';
import { isTenantStoragePath } from '@/lib/storage/paths';
import { checkStorageLimit, storageLimitResponseBody } from '@/lib/billing/storage-limit';

export const runtime = 'nodejs';

function cleanString(value: any) {
  return String(value ?? '').trim();
}

export async function POST(req: Request) {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const projectId = cleanString(body?.projectId);
    const fileName = cleanString(body?.fileName);
    const storagePath = cleanString(body?.storagePath);
    const downloadUrl = cleanString(body?.downloadUrl);
    const size = Number(body?.size || 0);

    const storageCheck = await checkStorageLimit(auth.user.tenantId ?? '', size);
    if (!storageCheck.ok) {
      return NextResponse.json(storageLimitResponseBody(storageCheck), { status: 403 });
    }
    const mimeType = cleanString(body?.mimeType);

    if (!projectId)
      return NextResponse.json({ ok: false, error: 'Project is required.' }, { status: 400 });
    if (!fileName || !storagePath || !downloadUrl) {
      return NextResponse.json({ ok: false, error: 'File details are required.' }, { status: 400 });
    }

    if (!isTenantStoragePath(storagePath, auth.user.tenantId ?? '')) {
      return NextResponse.json(
        { ok: false, error: 'Invalid storage path.' },
        { status: 400 },
      );
    }

    const fileValidation = validateFile(fileName, size);
    if (!fileValidation.valid) {
      return NextResponse.json({ ok: false, error: fileValidation.error }, { status: 400 });
    }

    const projectSnap = await adminDb.collection('projects').doc(projectId).get();
    if (!projectSnap.exists || projectSnap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
    }

    const project = projectSnap.data() || {};
    if (String(project.tenantId || '') !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    if (String(project.clientId || '') !== auth.clientId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = adminDb.collection('files').doc();

    await ref.set({
      id: ref.id,
      tenantId: auth.user.tenantId,
      projectId,
      projectName: cleanString(project.projectName || ''),
      clientId: auth.clientId,
      clientName: cleanString(project.clientName || ''),
      category: 'Client',
      fileName,
      storagePath,
      downloadUrl,
      size,
      mimeType,
      uploadedByUid: auth.user.uid,
      uploadedByName: cleanString(
        auth.user.name || auth.user.fullName || auth.user.displayName || '',
      ),
      uploadedByRole: 'client',
      version: null,
      notes: cleanString(body?.notes) || null,
      isLatest: true,
      isDeleted: false,
      uploadedAt: now,
      updatedAt: now,
    });

    const actorName = cleanString(
      auth.user.name || auth.user.fullName || auth.user.displayName || '',
    );
    const recipients = new Set<string>();
    if (project.ownerAmUid) recipients.add(String(project.ownerAmUid));
    const adminIds = await getUserIdsByRoles(['admin', 'super_admin'], auth.user.tenantId);
    adminIds.forEach((id) => recipients.add(id));

    await Promise.all(
      Array.from(recipients)
        .filter(Boolean)
        .map((uid) =>
          createNotification({
            toUserId: uid,
            title: 'Client file uploaded',
            body: `${project.projectName || 'Project'} has a new client file: ${fileName}.`,
            type: 'info',
            entityType: 'project',
            entityId: projectId,
            deepLink: uid === project.ownerAmUid ? '/am/files' : '/admin/projects/files',
            createdBy: { uid: auth.user.uid, name: actorName },
          }),
        ),
    );

    await createNotificationEvent({
      type: 'file.client_uploaded',
      title: 'Client file uploaded',
      description: `${project.projectName || 'Project'} has a new client file: ${fileName}.`,
      entityType: 'project',
      entityId: projectId,
      createdByUid: auth.user.uid,
      createdByName: actorName,
      metadata: {
        clientId: auth.clientId,
        fileId: ref.id,
      },
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    console.error('client/files upload error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Unable to upload file.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
