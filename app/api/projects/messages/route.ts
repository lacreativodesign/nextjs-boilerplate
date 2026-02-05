import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireProjectUser } from "../_utils";

export async function POST(req: Request) {
  const auth = await requireProjectUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json();
  const projectId = String(body.projectId || "");
  const message = String(body.message || "").trim();
  if (!projectId || !message) return NextResponse.json({ ok: false, error: "projectId and message are required" }, { status: 400 });

  await adminDb.collection("projectMessages").add({
    projectId,
    senderRole: auth.user.role,
    senderId: auth.user.uid,
    message,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
