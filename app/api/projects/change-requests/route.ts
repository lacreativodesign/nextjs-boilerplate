import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireProjectUser } from "../_utils";

export async function POST(req: Request) {
  const auth = await requireProjectUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (String(auth.user.role) !== "client") return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const projectId = String(body.projectId || "");
  const description = String(body.description || "").trim();
  if (!projectId || !description) return NextResponse.json({ ok: false, error: "projectId and description are required" }, { status: 400 });

  await adminDb.collection("changeRequests").add({
    projectId,
    requestedBy: auth.user.uid,
    description,
    status: "pending",
    requestedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const auth = await requireProjectUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!["am", "admin", "super_admin"].includes(String(auth.user.role))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const id = String(body.id || "");
  const status = String(body.status || "").toLowerCase();
  if (!id || !["approved", "rejected"].includes(status)) {
    return NextResponse.json({ ok: false, error: "id and valid status are required" }, { status: 400 });
  }

  await adminDb.collection("changeRequests").doc(id).set(
    {
      status,
      reviewedBy: auth.user.uid,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}
