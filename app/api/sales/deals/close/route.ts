import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { logEvent } from "@/lib/audit";
import {
  getWatcherUserIds,
  getSalesSettings,
  isSales,
  notifyUsers,
  parseString,
  requireSalesWrite,
  serverTimestamp,
  userLabel,
} from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant context missing." }, { status: 403 });
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
    const tenantId = String(data.tenantId || auth.user.tenantId);
    const role = auth.user.role || "";
    const isOwner = data.ownerId === auth.user.uid || data.createdBy === auth.user.uid;

    if (isSales(role) && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (tenantId !== String(auth.user.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const discountPct = Number(data.discountPct || 0);
    const { discountApprovalThresholdPct } = await getSalesSettings();
    const approvalThreshold = Number(discountApprovalThresholdPct ?? 0);
    const discountStatus = String(data.discountStatus || (discountPct > 0 ? "pending" : "none"));
    const discountApproved = Boolean(data.discountApproved);
    if (
      discountStatus === "pending" ||
      discountStatus === "rejected" ||
      (discountPct > approvalThreshold && !discountApproved)
    ) {
      return NextResponse.json(
        { ok: false, error: "Discount approval required before closing this deal." },
        { status: 403 }
      );
    }

    const stage = status === "Won" ? "Closed Won" : "Closed Lost";
    const existingStage = String(data.stage || "");
    const alreadyClosed = existingStage.toLowerCase().includes("closed");

    if (!alreadyClosed || existingStage !== stage) {
      await docRef.set(
        {
          status,
          stage,
          closedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: auth.user.uid,
          tenantId,
        },
        { merge: true }
      );
    } else {
      return NextResponse.json({ ok: true, status: "noop" });
    }

    await logEvent({
      tenantId,
      type: status === "Won" ? "deal_closed_won" : "deal_closed_lost",
      title: status === "Won" ? "Deal closed won" : "Deal closed lost",
      description: `${data.dealName || data.leadName || "Deal"} marked ${stage}.`,
      entityType: "deal",
      entityId: id,
      actor: { uid: auth.user.uid, name: userLabel(auth.user) },
      metadata: { stage, status },
    });

    const watchers = await getWatcherUserIds(tenantId);
    await notifyUsers({
      userIds: [data.ownerId, ...watchers].filter(Boolean),
      title: status === "Won" ? "Deal won" : "Deal lost",
      body: `${data.dealName || data.leadName || "Deal"} marked ${stage}.`,
      deepLink: "/sales/deals",
      entityType: "deal",
      entityId: id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
      tenantId,
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        tenantId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales deals close error:", err);
    return NextResponse.json({ ok: false, error: "Unable to close deal." }, { status: 500 });
  }
}
