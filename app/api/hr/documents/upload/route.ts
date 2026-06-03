import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createHrEvent, createHrNotification, getRouteForRole, requireHrAccess, serverTimestamp } from "../../_utils";
import { validateFile } from "@/lib/files/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const userId = String(body?.userId || "").trim();
    const docType = String(body?.docType || "").trim();
    const fileName = String(body?.fileName || "").trim();
    const storagePath = String(body?.storagePath || "").trim();
    const downloadUrl = String(body?.downloadUrl || "").trim();

    if (!userId || !docType || !fileName || !storagePath || !downloadUrl) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const fileValidation = validateFile(fileName, Number(body?.size || 0));
    if (!fileValidation.valid) {
      return NextResponse.json({ ok: false, error: fileValidation.error }, { status: 400 });
    }

    const docRef = id ? adminDb.collection("employeeDocuments").doc(id) : adminDb.collection("employeeDocuments").doc();

    const payload = {
      id: docRef.id,
      userId,
      docType,
      fileName,
      storagePath,
      downloadUrl,
      uploadedBy: access.user.uid,
      tenantId: access.user.tenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false,
    };

    await docRef.set(payload, { merge: true });

    await createHrEvent({
      type: "hr.document_uploaded",
      title: "Document uploaded",
      description: `${fileName} uploaded for employee.`,
      entityType: "employeeDocument",
      entityId: docRef.id,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || "Admin",
      metadata: { userId, docType },
    });

    const userSnap = await adminDb.collection("users").doc(userId).get();
    const userData = userSnap.data() || {};
    const employeeRoute = getRouteForRole(userData?.role || "");

    await createHrNotification({
      userId,
      title: "Document uploaded",
      message: `${fileName} has been uploaded to your profile.`,
      type: "hr.document_uploaded",
      entityId: docRef.id,
      deepLink: employeeRoute,
      createdBy: {
        uid: access.user.uid,
        name: access.user.name || access.user.email || "Admin",
      },
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err) {
    console.error("HR documents upload error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
