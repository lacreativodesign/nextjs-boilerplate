import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireProjectUser } from "../_utils";

export async function POST(req: Request) {
  const auth = await requireProjectUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!["admin", "super_admin"].includes(String(auth.user.role))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const projectId = String(body.projectId || "");
  const assignedAM = String(body.assignedAM || "") || null;
  const assignedProduction = String(body.assignedProduction || "") || null;
  if (!projectId) return NextResponse.json({ ok: false, error: "projectId required" }, { status: 400 });

  await adminDb.collection("projects").doc(projectId).set(
    {
      assignedAM,
      assignedProduction,
      assignedAmUid: assignedAM,
      assignedProdUid: assignedProduction,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}
