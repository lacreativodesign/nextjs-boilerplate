import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createSalesEvent,
  getWatcherUserIds,
  isSales,
  nowIso,
  notifyUsers,
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

    const body = await req.json();
    const id = parseString(body.id, "");
    const status = parseString(body.status, "");

    if (!id || !["Won", "Lost"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });
    }

    const docRef = adminDb.collection("deals").doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false, error: "Deal not found." }, { status: 404 });
    }

    const data = snapshot.data() || {};
    const role = auth.user.role || "";
    const isOwner = data.ownerId === auth.user.uid || data.createdBy === auth.user.uid;

    if (isSales(role) && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const now = nowIso();
    const stage = status === "Won" ? "Closed Won" : "Closed Lost";
    const existingStage = String(data.stage || "");
    const alreadyClosed = existingStage.toLowerCase().includes("closed");

    if (!alreadyClosed || existingStage !== stage) {
      await docRef.set(
        {
          status,
          stage,
          closedAt: now,
          updatedAt: now,
          updatedBy: auth.user.uid,
        },
        { merge: true }
      );
    } else {
      return NextResponse.json({ ok: true, status: "noop" });
    }

    await createSalesEvent({
      type: status === "Won" ? "deal_closed_won" : "deal_closed_lost",
      title: status === "Won" ? "Deal closed won" : "Deal closed lost",
      description: `${data.dealName || data.leadName || "Deal"} marked ${stage}.`,
      entityType: "deal",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: userLabel(auth.user),
      metadata: { stage, status },
    });

    const watchers = await getWatcherUserIds();
    await notifyUsers({
      userIds: [data.ownerId, ...watchers].filter(Boolean),
      title: status === "Won" ? "Deal won" : "Deal lost",
      body: `${data.dealName || data.leadName || "Deal"} marked ${stage}.`,
      deepLink: "/sales/deals",
      entityType: "deal",
      entityId: id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
    });

    if (status === "Won") {
      await adminDb.collection("events").add({
        type: "sales_deal_won_stub",
        title: "Sales deal won",
        description: `${data.dealName || data.leadName || "Deal"} ready for fulfillment review.`,
        entityType: "deal",
        entityId: id,
        metadata: {
          source: "sales",
          leadId: data.leadId || null,
        },
        createdByUid: auth.user.uid,
        createdByName: userLabel(auth.user),
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales deals close error:", err);
    return NextResponse.json({ ok: false, error: "Unable to close deal." }, { status: 500 });
  }
}
