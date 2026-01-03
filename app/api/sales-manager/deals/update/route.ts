import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  arrayUnion,
  createSalesEvent,
  getAdminUserIds,
  notifyUsers,
  parseBoolean,
  parseNumber,
  parseString,
  requireSalesManager,
  serverTimestamp,
} from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const id = parseString(payload.id, "");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing deal id." }, { status: 400 });
    }

    const dealRef = adminDb.collection("deals").doc(id);
    let prevStage = "";
    let nextStage = "";
    let ownerId: string | null = null;
    let closedWonPaid = false;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(dealRef);
      if (!snap.exists) {
        throw new Error("Deal not found");
      }
      const data = snap.data() || {};
      prevStage = parseString(data.stage, "New Lead");
      nextStage = payload.stage !== undefined ? parseString(payload.stage, prevStage) : prevStage;
      ownerId = parseString(payload.ownerId ?? data.ownerId, "") || null;
      const updates: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };

      if (payload.dealName !== undefined) updates.dealName = parseString(payload.dealName, "");
      if (payload.clientName !== undefined) updates.clientName = parseString(payload.clientName, "");
      if (payload.valueUsd !== undefined) updates.valueUsd = parseNumber(payload.valueUsd, 0);
      if (payload.probability !== undefined) updates.probability = parseNumber(payload.probability, 0);
      if (payload.ownerId !== undefined) updates.ownerId = parseString(payload.ownerId, "") || null;
      if (payload.ownerName !== undefined) updates.ownerName = parseString(payload.ownerName, "") || null;
      if (payload.expectedCloseDate !== undefined) {
        updates.expectedCloseDate = payload.expectedCloseDate ? new Date(payload.expectedCloseDate) : null;
      }
      if (payload.notes !== undefined) updates.notes = parseString(payload.notes, "");
      if (payload.discountApproved !== undefined) updates.discountApproved = parseBoolean(payload.discountApproved, false);

      if (nextStage !== prevStage) {
        updates.stage = nextStage;
        updates.stageHistory = arrayUnion({
          from: prevStage,
          to: nextStage,
          changedAt: serverTimestamp(),
          changedByUid: auth.user.uid,
          changedByName: auth.user.name || auth.user.fullName || "",
        });

        if (nextStage === "Closed Won") {
          updates.closedWonAt = serverTimestamp();
          const paymentStatus = parseString(data.paymentStatus, "");
          closedWonPaid = paymentStatus.toLowerCase() === "paid";
        }

        if (nextStage === "Closed Lost") {
          updates.closedLostAt = serverTimestamp();
        }
      }

      tx.set(dealRef, updates, { merge: true });
    });

    const createdByName = auth.user.name || auth.user.fullName || "";
    const stageChanged = nextStage && prevStage && nextStage !== prevStage;
    const isClosed = nextStage === "Closed Won" || nextStage === "Closed Lost";
    const stageTitle = stageChanged
      ? isClosed
        ? nextStage === "Closed Won"
          ? "Deal closed won"
          : "Deal closed lost"
        : "Deal stage moved"
      : "Deal updated";
    const stageDescription = stageChanged ? `Deal ${id} moved to ${nextStage}` : `Deal ${id} updated`;

    await createSalesEvent({
      type: stageChanged ? "deal_stage_change" : "deal_updated",
      title: stageTitle,
      description: stageDescription,
      entityType: "deal",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName,
      metadata: stageChanged ? { stage: nextStage } : undefined,
    });

    if (stageChanged && !isClosed) {
      await notifyUsers({
        userIds: [auth.user.uid, ownerId || ""],
        title: "Deal stage moved",
        body: `Deal ${id} moved to ${nextStage}.`,
        entityType: "deal",
        entityId: id,
        deepLink: "/sales-manager/deals",
        createdBy: { uid: auth.user.uid, name: createdByName },
      });
    }

    if (isClosed) {
      await notifyUsers({
        userIds: [auth.user.uid, ownerId || ""],
        title: nextStage === "Closed Won" ? "Deal closed won" : "Deal closed lost",
        body: `Deal ${id} marked ${nextStage}.`,
        entityType: "deal",
        entityId: id,
        deepLink: "/sales-manager/deals",
        createdBy: { uid: auth.user.uid, name: createdByName },
      });
    }

    if (nextStage === "Closed Won" && closedWonPaid) {
      const adminIds = await getAdminUserIds();
      await notifyUsers({
        userIds: adminIds,
        title: "Paid deal closed won",
        body: `Deal ${id} closed won and marked paid. Review admin workflow.`,
        entityType: "deal",
        entityId: id,
        deepLink: "/sales-manager/deals",
        createdBy: { uid: auth.user.uid, name: createdByName },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales manager deal update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update deal." }, { status: 500 });
  }
}
