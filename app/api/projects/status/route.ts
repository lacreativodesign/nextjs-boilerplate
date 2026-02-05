import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { canTransitionStatus, normalizeDeliveryStatus } from "@/lib/projects";
import { requireProjectUser } from "../_utils";

export async function POST(req: Request) {
  const auth = await requireProjectUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json();
  const projectId = String(body.projectId || "");
  const nextStatus = normalizeDeliveryStatus(body.status);
  const allowOverride = Boolean(body.adminOverride);

  if (!projectId) return NextResponse.json({ ok: false, error: "projectId required" }, { status: 400 });
  if (!["admin", "super_admin", "am"].includes(String(auth.user.role))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const ref = adminDb.collection("projects").doc(projectId);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Project not found");
    const data = snap.data() || {};
    const current = normalizeDeliveryStatus(data.status || data.statusPipeline || data.stage);
    const isAdmin = ["admin", "super_admin"].includes(String(auth.user.role));
    if (!isAdmin && String(data.assignedAM || data.assignedAmUid || "") !== auth.user.uid) {
      throw new Error("Forbidden");
    }
    if (!canTransitionStatus(current, nextStatus, isAdmin && allowOverride)) {
      throw new Error("Invalid status transition");
    }

    tx.set(
      ref,
      {
        status: nextStatus,
        statusPipeline: nextStatus,
        stage: nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return NextResponse.json({ ok: true });
}
