import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../../admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminRole(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    const title = String(body?.title || "").trim();
    const message = String(body?.message || "").trim();
    const type = String(body?.type || "info").trim();

    if (!userId || !title || !message) {
      return NextResponse.json(
        { ok: false, error: "userId, title, and message are required." },
        { status: 400 }
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = adminDb.collection("notifications").doc();
    await ref.set({
      userId,
      recipientUid: userId,
      title,
      body: message,
      message,
      type,
      entityType: body?.entityType || null,
      entityId: body?.entityId || null,
      deepLink: body?.deepLink || null,
      read: false,
      isRead: false,
      tenantId: me.tenantId,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    console.error("notifications create error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to create notification.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
