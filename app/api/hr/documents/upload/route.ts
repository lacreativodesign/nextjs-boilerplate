import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  createHrEvent,
  createHrNotification,
  getRouteForRole,
  requireHrAccess,
  serverTimestamp,
} from '../../_utils';
import { validateFile } from '@/lib/files/validation';
import { isTenantStoragePath } from '@/lib/storage/paths';
import {
  admitTenantUpload,
  releaseUploadAdmission,
  uploadAdmissionResponseBody,
  type UploadAdmission,
} from '@/lib/billing/upload-admission';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // Held across the whole request so the `finally` below always releases it.
  let admission: UploadAdmission | null = null;

  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || '').trim();
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

    // Validate the target employee belongs to the actor's tenant BEFORE writing or
    // notifying. A cross-tenant userId must not reveal existence — return 404.
    const targetSnap = await adminDb.collection('users').doc(userId).get();
    const targetData = targetSnap.data() || {};
    if (!targetSnap.exists || String(targetData?.tenantId || '') !== access.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'Employee not found' }, { status: 404 });
    }

    // When updating an existing document, load it and require it to belong to the
    // actor's tenant. This prevents supplying an arbitrary cross-tenant document id
    // with merge semantics to overwrite or hijack another tenant's record.
    let docRef;
    if (id) {
      const existingRef = adminDb.collection('employeeDocuments').doc(id);
      const existingSnap = await existingRef.get();
      if (
        !existingSnap.exists ||
        String(existingSnap.data()?.tenantId || '') !== access.user.tenantId
      ) {
        return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 });
      }
      docRef = existingRef;
    } else {
      docRef = adminDb.collection('employeeDocuments').doc();
    }

    // PR4-C: the browser wrote this object to Cloud Storage before calling us, so the
    // `size` in the body is the caller's claim about its own upload, not a fact. Admission
    // measures the object through the Admin SDK, reserves exactly that many bytes in one
    // atomic transaction (so two concurrent uploads cannot both take the last of the
    // quota), and deletes the object again if the tenant has no room for it.
    admission = await admitTenantUpload({
      tenantId: access.user.tenantId,
      storagePath,
      kind: 'hr_document_register',
      // One storagePath is one physical object: a retried registration must reuse its
      // reservation rather than be charged for the same bytes twice.
      idempotencyKey: storagePath,
    });
    if (!admission.ok) {
      return NextResponse.json(uploadAdmissionResponseBody(admission), {
        status: admission.status,
      });
    }

    const payload = {
      id: docRef.id,
      userId,
      docType,
      fileName,
      storagePath,
      downloadUrl,
      // S11: persisted so HR documents are counted against the plan storage limit.
      // PR4-C: the size Cloud Storage actually recorded, never the declared one.
      size: admission.bytes,
      uploadedBy: access.user.uid,
      tenantId: access.user.tenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false,
    };

    await docRef.set(payload, { merge: true });

    await createHrEvent({
      type: 'hr.document_uploaded',
      title: 'Document uploaded',
      description: `${fileName} uploaded for employee.`,
      entityType: 'employeeDocument',
      entityId: docRef.id,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || 'Admin',
      metadata: { userId, docType },
      tenantId: access.user.tenantId,
    });

    const employeeRoute = getRouteForRole(targetData?.role || '');

    await createHrNotification({
      userId,
      title: 'Document uploaded',
      message: `${fileName} has been uploaded to your profile.`,
      type: 'hr.document_uploaded',
      entityId: docRef.id,
      deepLink: employeeRoute,
      createdBy: {
        uid: access.user.uid,
        name: access.user.name || access.user.email || 'Admin',
      },
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err) {
    console.error('HR documents upload error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  } finally {
    // The metadata record now counts these bytes (or the upload failed and the space
    // must go straight back), so the reservation must not outlive the request.
    await releaseUploadAdmission(admission);
  }
}
