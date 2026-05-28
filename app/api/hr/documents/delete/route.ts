import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createHrEvent, normalizeRole, requireHrAccess, serverTimestamp } from "../../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const docId = String(body?.docId || "").trim();
    if (!docId) {
      return NextResponse.json({ ok: false, error: "Missing document id" }, { status: 400 });
    }

    const ref = adminDb.collection("employeeDocuments").doc(docId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    const data = snap.data() || {};
    const requesterRole = normalizeRole(access.user.role);
    if (requesterRole !== "super_admin" && data?.tenantId !== access.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    if (data?.userId) {
      const userSnap = await adminDb.collection("users").doc(String(data.userId)).get();
      const userRole = normalizeRole(userSnap.data()?.role || "");
      if (requesterRole === "hr" && userRole === "super_admin") {
        return NextResponse.json({ ok: false, error: "Cannot delete documents for super admin users." }, { status: 403 });
      }
    }

    await ref.update({
      isDeleted: true,
      updatedAt: serverTimestamp(),
    });

    await createHrEvent({
      type: "hr.document_deleted",
      title: "Document removed",
      description: `${data?.fileName || "Document"} marked as deleted.`,
      entityType: "employeeDocument",
      entityId: docId,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || "Admin",
      metadata: { userId: data?.userId || null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("HR documents delete error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
