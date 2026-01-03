import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createSalesEvent,
  getWatcherUserIds,
  notifyUsers,
  nowIso,
  parseString,
  requireSalesWrite,
  userLabel,
} from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const id = parseString(payload.id, "");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Follow-up id is required." }, { status: 400 });
    }

    const docRef = adminDb.collection("followUps").doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false, error: "Follow-up not found." }, { status: 404 });
    }

    const existing = snapshot.data() || {};
    const isOwner = existing.assignedTo === auth.user.uid || existing.createdBy === auth.user.uid;
    if (auth.user.role === "sales" && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const status = parseString(payload.status, existing.status || "Open");
    const dueDate = parseString(payload.dueDate, "");

    const now = nowIso();
    await docRef.set(
      {
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : existing.dueDate || null,
        updatedAt: now,
        updatedBy: auth.user.uid,
      },
      { merge: true }
    );

    await createSalesEvent({
      type: status === "Done" ? "follow_up_completed" : "follow_up_updated",
      title: status === "Done" ? "Follow-up completed" : "Follow-up updated",
      description: `${existing.relatedName || "Follow-up"} marked ${status}.`,
      entityType: "follow_up",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: userLabel(auth.user),
    });

    const watchers = await getWatcherUserIds();
    await notifyUsers({
      userIds: [existing.assignedTo, ...watchers].filter(Boolean),
      title: status === "Done" ? "Follow-up completed" : "Follow-up updated",
      body: `${existing.relatedName || "Follow-up"} marked ${status}.`,
      deepLink: "/sales/follow-ups",
      entityType: "follow_up",
      entityId: id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales follow-ups update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update follow-up." }, { status: 500 });
  }
}
