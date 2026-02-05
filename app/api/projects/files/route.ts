import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireProjectUser } from "../_utils";

const ALLOWED_TYPES = ["draft", "revision", "final"] as const;

export async function POST(req: Request) {
  const auth = await requireProjectUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json();
  const projectId = String(body.projectId || "");
  const type = String(body.type || "").toLowerCase();
  const fileUrl = String(body.fileUrl || "");

  if (!projectId || !fileUrl || !ALLOWED_TYPES.includes(type as any)) {
    return NextResponse.json({ ok: false, error: "projectId, type and fileUrl are required" }, { status: 400 });
  }

  const role = String(auth.user.role);
  if (role === "client") return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  if (role === "production" && type === "final") {
    return NextResponse.json({ ok: false, error: "Production cannot upload final files" }, { status: 403 });
  }
  if (!["admin", "super_admin", "am", "production"].includes(role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const projectSnap = await adminDb.collection("projects").doc(projectId).get();
  if (!projectSnap.exists) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
  const project = projectSnap.data() || {};

  if (role === "am" && String(project.assignedAM || project.assignedAmUid || "") !== auth.user.uid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (role === "production" && String(project.assignedProduction || project.assignedProdUid || "") !== auth.user.uid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  await adminDb.collection("projectFiles").add({
    projectId,
    type,
    fileUrl,
    uploadedBy: auth.user.uid,
    uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
