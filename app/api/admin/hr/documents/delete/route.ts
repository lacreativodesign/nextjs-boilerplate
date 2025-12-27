import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createHrEvent, requireHrAccess, serverTimestamp } from "../../_utils";

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
