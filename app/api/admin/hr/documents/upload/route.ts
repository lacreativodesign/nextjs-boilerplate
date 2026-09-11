import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { createHrEvent, requireHrAccess, serverTimestamp } from '../../_utils';
import { logActivity } from '@/lib/activity/tracker';
import { validateFile } from '@/lib/files/validation';
import { isTenantStoragePath } from '@/lib/storage/paths';
import {
  admitTenantUpload,
  registrationIdForPath,
  releaseUploadAdmission,
  uploadAdmissionRefusal,
  type UploadAdmission,
} from '@/lib/billing/upload-admission';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let admission: UploadAdmission | null = null; // released in the `finally` below

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

    if (!isTenantStoragePath(storagePath, access.user.tenantId)) {
      return NextResponse.json({ ok: false, error: 'Invalid storage path.' }, { status: 400 });
    }

    const size = Number(body?.size || 0);

    const fileValidation = validateFile(fileName, size);
    if (!fileValidation.valid) {
      return NextResponse.json({ ok: false, error: fileValidation.error }, { status: 400 });
    }

    // PR4-C: the `size` in the body is the caller's claim about bytes the browser
    // already wrote. Admission measures the object, reserves it atomically, and
    // removes it if refused. See lib/billing/upload-admission.ts.
    admission = await admitTenantUpload({
      tenantId: access.user.tenantId,
      storagePath,
      kind: 'hr_document_register',
    });
    if (!admission.ok) return uploadAdmissionRefusal(admission);

    const payload = {
      userId,
      docType,
      fileName,
      storagePath,
      downloadUrl,
      // S11: this record was written with NO tenantId, so it was invisible to the
      // tenant-scoped HR document list AND to storage accounting. Same defect class as
      // the file records fixed earlier; this admin route was the missed sibling.
      tenantId: access.user.tenantId,
      size: admission.bytes, // measured by Cloud Storage, never the declared value
      uploadedBy: access.user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false,
    };

    // PR4: one storage path is one physical object, so its record id is derived from
    // the path. `add()` minted a fresh id per POST, so a retry after a partial failure
    // wrote a second live record for the same object and counted its bytes twice.
    const ref = adminDb.collection('employeeDocuments').doc(registrationIdForPath(storagePath));
    await ref.set(payload, { merge: true });

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
  } finally {
    // The record now counts these bytes, or the upload failed and the space goes back.
    await releaseUploadAdmission(admission);
  }
}
