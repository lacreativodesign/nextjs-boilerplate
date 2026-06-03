import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { createHrEvent, requireHrAccess, serverTimestamp } from '../../_utils';
import { logActivity } from '@/lib/activity/tracker';
import { validateFile } from '@/lib/files/validation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || '').trim();
    const docType = String(body?.docType || '').trim();
    const fileName = String(body?.fileName || '').trim();
    const storagePath = String(body?.storagePath || '').trim();
    const downloadUrl = String(body?.downloadUrl || '').trim();

    if (!userId || !docType || !fileName || !storagePath || !downloadUrl) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
    }

    const fileValidation = validateFile(fileName, Number(body?.size || 0));
    if (!fileValidation.valid) {
      return NextResponse.json({ ok: false, error: fileValidation.error }, { status: 400 });
    }

    const payload = {
      userId,
      docType,
      fileName,
      storagePath,
      downloadUrl,
      uploadedBy: access.user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false,
    };

    const ref = await adminDb.collection('employeeDocuments').add(payload);

    await createHrEvent({
      type: 'hr.document_uploaded',
      title: 'Document uploaded',
      description: `${fileName} uploaded for employee.`,
      entityType: 'employeeDocument',
      entityId: ref.id,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || 'Admin',
      metadata: { userId, docType },
    });

    await logActivity({
      tenantId: access.user.tenantId,
      actor: { uid: access.user.uid, name: access.user.name || access.user.email || 'Admin' },
      action: 'created',
      entityType: 'document',
      entityId: ref.id,
      entityName: fileName,
      category: 'project',
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('HR documents upload error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
