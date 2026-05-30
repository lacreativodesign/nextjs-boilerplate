import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminOrSuper } from "../../../_utils";

export const runtime = "nodejs";

const ALLOWED_TYPES = [
  "production.assigned",
  "project.stage_moved",
  "file.uploaded",
  "project.qa_approved",
  "project.qa_rejected",
];

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminOrSuper(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const type = String(body?.type || "").trim();
    const projectId = String(body?.projectId || "").trim();

    if (!type || !ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ ok: false, error: "Invalid event type." }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Project id is required." }, { status: 400 });
    }

    await adminDb.collection("automationEvents").add({
      tenantId: me.tenantId,
      type,
      projectId,
      actorId: me.uid,
      actorName: me.name || me.fullName || me.displayName || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      payload: body?.payload || {},
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("production/events create error:", err);
    const rawMessage = String((err instanceof Error ? err.message : undefined) || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to create event right now.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
