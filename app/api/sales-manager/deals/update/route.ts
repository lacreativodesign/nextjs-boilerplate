import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";
import { logEvent } from "@/lib/audit";
import {
  arrayUnion,
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
    let createdByUid: string | null = null;
    let closedWonPaid = false;
    let discountDecision: "approved" | "rejected" | null = null;
    let discountPct = 0;
    let listPriceUsd = 0;
    let finalPriceUsd = 0;
    let dealName = "";
    let tenantId = auth.user.tenantId || DEFAULT_TENANT_ID;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(dealRef);
      if (!snap.exists) {
        throw new Error("Deal not found");
      }
      const data = snap.data() || {};
      tenantId = String(data.tenantId || tenantId || DEFAULT_TENANT_ID);
      if (tenantId !== String(auth.user.tenantId || DEFAULT_TENANT_ID)) {
        throw new Error("Forbidden");
      }
      prevStage = parseString(data.stage, "New Lead");
      nextStage = payload.stage !== undefined ? parseString(payload.stage, prevStage) : prevStage;
      ownerId = parseString(payload.ownerId ?? data.ownerId, "") || null;
      createdByUid = parseString(data.createdBy, "") || null;
      dealName = parseString(data.dealName, "") || parseString(data.leadName, "");
      discountPct = parseNumber(data.discountPct, 0);
      listPriceUsd = parseNumber(data.listPriceUsd || data.valueUsd || data.amountUsd, 0);
      finalPriceUsd = parseNumber(data.finalPriceUsd, listPriceUsd - (listPriceUsd * discountPct) / 100);
      const updates: Record<string, any> = {
        updatedAt: serverTimestamp(),
        tenantId,
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

      const actionRaw = parseString(payload.discountAction, "");
      const discountAction =
        actionRaw || (payload.discountApproved === true ? "approve" : payload.discountApproved === false ? "reject" : "");
      if (discountAction) {
        const currentStatus = parseString(data.discountStatus, discountPct > 0 ? "pending" : "none");
        if (currentStatus !== "pending") {
          throw new Error("Discount approval is not pending.");
        }
        if (discountAction === "approve") {
          updates.discountApproved = true;
          updates.discountStatus = "approved";
          updates.discountApprovedAt = serverTimestamp();
          updates.discountApprovedByUid = auth.user.uid;
          updates.discountApprovedByName = auth.user.name || auth.user.fullName || "";
          discountDecision = "approved";
        }
        if (discountAction === "reject") {
          updates.discountApproved = false;
          updates.discountStatus = "rejected";
          updates.discountApprovedAt = serverTimestamp();
          updates.discountApprovedByUid = auth.user.uid;
          updates.discountApprovedByName = auth.user.name || auth.user.fullName || "";
          discountDecision = "rejected";
        }
      } else if (payload.discountApproved !== undefined) {
        updates.discountApproved = parseBoolean(payload.discountApproved, false);
      }

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

    await logEvent({
      tenantId,
      type: stageChanged ? "deal_stage_change" : "deal_updated",
      title: stageTitle,
      description: stageDescription,
      entityType: "deal",
      entityId: id,
      actor: { uid: auth.user.uid, name: createdByName },
      metadata: stageChanged ? { stage: nextStage } : undefined,
    });

    if (stageChanged && !isClosed) {
      await notifyUsers({
        userIds: [auth.user.uid, ownerId || ""],
        title: "Deal stage moved",
        body: `Deal ${id} moved to ${nextStage}.`,
        entityType: "deal",
        entityId: id,
        deepLink: "/sales_manager/deals",
        createdBy: { uid: auth.user.uid, name: createdByName },
        tenantId,
      });
    }

    if (isClosed) {
      await notifyUsers({
        userIds: [auth.user.uid, ownerId || ""],
        title: nextStage === "Closed Won" ? "Deal closed won" : "Deal closed lost",
        body: `Deal ${id} marked ${nextStage}.`,
        entityType: "deal",
        entityId: id,
        deepLink: "/sales_manager/deals",
        createdBy: { uid: auth.user.uid, name: createdByName },
        tenantId,
      });
    }

    if (nextStage === "Closed Won" && closedWonPaid) {
      const adminIds = await getAdminUserIds(tenantId);
      await notifyUsers({
        userIds: adminIds,
        title: "Paid deal closed won",
        body: `Deal ${id} closed won and marked paid. Review admin workflow.`,
        entityType: "deal",
        entityId: id,
        deepLink: "/sales_manager/deals",
        createdBy: { uid: auth.user.uid, name: createdByName },
        tenantId,
      });
    }

    if (discountDecision) {
      const discountTitle =
        discountDecision === "approved" ? "Discount approved" : "Discount rejected";
      const discountType =
        discountDecision === "approved" ? "sales.discount.approved" : "sales.discount.rejected";
      await logEvent({
        tenantId,
        type: discountType,
        title: discountTitle,
        description: `${dealName || "Deal"} discount ${discountDecision}.`,
        entityType: "deal",
        entityId: id,
        actor: { uid: auth.user.uid, name: createdByName },
        metadata: { discountPct, listPriceUsd, finalPriceUsd },
      });

      const notifyTargets = Array.from(new Set([ownerId, createdByUid].filter(Boolean))) as string[];
      if (notifyTargets.length) {
        await notifyUsers({
          userIds: notifyTargets,
          title: discountTitle,
          body: `${dealName || "Deal"} discount was ${discountDecision}.`,
          entityType: "deal",
          entityId: id,
          deepLink: "/sales/deals",
          createdBy: { uid: auth.user.uid, name: createdByName },
          tenantId,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales manager deal update error:", err);
    const message = String(err?.message || "");
    if (message.toLowerCase().includes("forbidden")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (message.toLowerCase().includes("discount approval")) {
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Unable to update deal." }, { status: 500 });
  }
}
