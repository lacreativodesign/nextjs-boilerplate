import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";
import { logEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import {
  getSalesSettings,
  getWatcherUserIds,
  isSales,
  notifyUsers,
  parseNumber,
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

    const body = await req.json().catch(() => ({}));
    const id = parseString(body?.id, "");
    const discountPct = parseNumber(body?.discountPct, 0);
    const discountReason = parseString(body?.discountReason, "").trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing deal id." }, { status: 400 });
    }

    if (Number.isNaN(discountPct) || discountPct < 0 || discountPct > 80) {
      return NextResponse.json({ ok: false, error: "Discount must be between 0% and 80%." }, { status: 400 });
    }

    if (discountPct > 0 && !discountReason) {
      return NextResponse.json({ ok: false, error: "Discount reason is required." }, { status: 400 });
    }

    const dealRef = adminDb.collection("deals").doc(id);
    const snap = await dealRef.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Deal not found." }, { status: 404 });
    }

    const data = snap.data() || {};
    const tenantId = String(data.tenantId || auth.user.tenantId || DEFAULT_TENANT_ID);
    const actorName = userLabel(auth.user);

    if (tenantId !== String(auth.user.tenantId || DEFAULT_TENANT_ID)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const role = auth.user.role || "";
    const isOwner = data.ownerId === auth.user.uid || data.createdBy === auth.user.uid;
    if (isSales(role) && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const listPriceUsd = Number(data.listPriceUsd || data.valueUsd || data.amountUsd || 0);
    const discountUsd = Number(((listPriceUsd * discountPct) / 100).toFixed(2));
    const finalPriceUsd = Number(Math.max(listPriceUsd - discountUsd, 0).toFixed(2));
    const { discountApprovalThresholdPct } = await getSalesSettings();
    const approvalThreshold = Number(discountApprovalThresholdPct ?? 0);

    const approvalsRef = adminDb.collection("approvals");
    const existingApprovalSnap = await approvalsRef
      .where("tenantId", "==", tenantId)
      .where("type", "==", "discount")
      .where("entityId", "==", id)
      .where("status", "==", "pending")
      .limit(1)
      .get();
    const existingApprovalDoc = existingApprovalSnap.docs[0] || null;
    const requiresApproval = discountPct > approvalThreshold;

    const updates: Record<string, unknown> = {
      listPriceUsd,
      discountPct,
      discountUsd,
      finalPriceUsd,
      valueUsd: finalPriceUsd,
      discountReason: discountPct > 0 ? discountReason : null,
      updatedAt: serverTimestamp(),
      updatedBy: auth.user.uid,
      tenantId,
    };

    if (discountPct <= 0) {
      updates.discountApproved = true;
      updates.discountStatus = "none";
      updates.discountRequestedAt = null;
      updates.discountRequestedByUid = null;
      updates.discountApprovedAt = null;
      updates.discountApprovedByUid = null;
      updates.discountApprovedByName = null;
      updates.discountApprovalId = null;
      updates.discountApprovedPct = 0;
      updates.discountApprovedUsd = 0;
      updates.discountApprovedFinalPriceUsd = listPriceUsd;
    } else if (!requiresApproval) {
      updates.discountApproved = true;
      updates.discountStatus = "auto_approved";
      updates.discountRequestedAt = serverTimestamp();
      updates.discountRequestedByUid = auth.user.uid;
      updates.discountApprovedAt = serverTimestamp();
      updates.discountApprovedByUid = auth.user.uid;
      updates.discountApprovedByName = actorName;
      updates.discountApprovalId = null;
      updates.discountApprovedPct = discountPct;
      updates.discountApprovedUsd = discountUsd;
      updates.discountApprovedFinalPriceUsd = finalPriceUsd;
    } else {
      updates.discountApproved = false;
      updates.discountStatus = "pending";
      updates.discountRequestedAt = serverTimestamp();
      updates.discountRequestedByUid = auth.user.uid;
      updates.discountApprovedAt = null;
      updates.discountApprovedByUid = null;
      updates.discountApprovedByName = null;
      updates.discountApprovedPct = null;
      updates.discountApprovedUsd = null;
      updates.discountApprovedFinalPriceUsd = null;
    }

    const batch = adminDb.batch();
    let approvalId: string | null = null;

    if (requiresApproval) {
      if (existingApprovalDoc) {
        approvalId = existingApprovalDoc.id;
        batch.set(
          existingApprovalDoc.ref,
          {
            requestedData: {
              discountPct,
              discountUsd,
              finalPriceUsd,
              listPriceUsd,
              dealName: data.dealName || data.leadName || "",
              reason: discountReason,
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        const approvalRef = approvalsRef.doc();
        approvalId = approvalRef.id;
        batch.set(approvalRef, {
          tenantId,
          type: "discount",
          entityType: "deal",
          entityId: id,
          requestedBy: {
            uid: auth.user.uid,
            role: role || "sales",
          },
          requestedData: {
            discountPct,
            discountUsd,
            finalPriceUsd,
            listPriceUsd,
            dealName: data.dealName || data.leadName || "",
            reason: discountReason,
          },
          status: "pending",
          approvalChain: [{ role: "sales_manager" }],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (!requiresApproval && existingApprovalDoc) {
      batch.set(
        existingApprovalDoc.ref,
        {
          status: "rejected",
          approvalChain: [
            ...(Array.isArray(existingApprovalDoc.data()?.approvalChain)
              ? existingApprovalDoc.data()?.approvalChain
              : []),
            {
              role: role || "sales",
              uid: auth.user.uid,
              decision: "rejected",
              note: "Discount adjusted below approval threshold.",
              decidedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          ],
          finalDecisionBy: { uid: auth.user.uid, role: role || "sales" },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    updates.discountApprovalId = approvalId;
    batch.set(dealRef, updates, { merge: true });
    await batch.commit();

    if (discountPct > 0 && !requiresApproval) {
      await logEvent({
        tenantId,
        type: "sales.discount.auto_approved",
        title: "Discount auto-approved",
        description: `${data.dealName || data.leadName || "Deal"} auto-approved at ${discountPct}%.`,
        entityType: "deal",
        entityId: id,
        actor: { uid: auth.user.uid, name: actorName },
        metadata: { discountPct, listPriceUsd, finalPriceUsd },
      });

      await createNotification({
        toUserId: auth.user.uid,
        title: "Discount auto-approved",
        body: `${data.dealName || data.leadName || "Deal"} approved at ${discountPct}% discount.`,
        type: "success",
        entityType: "deal",
        entityId: id,
        deepLink: "/sales/deals",
        createdBy: { uid: auth.user.uid, name: actorName },
        tenantId,
      });
    }

    if (requiresApproval) {
      await logEvent({
        tenantId,
        type: "sales.discount.requested",
        title: "Discount approval requested",
        description: `${data.dealName || data.leadName || "Deal"} requested ${discountPct}% discount.`,
        entityType: "deal",
        entityId: id,
        actor: { uid: auth.user.uid, name: actorName },
        metadata: {
          before: {
            discountPct: Number(data.discountPct || 0),
            finalPriceUsd: Number(data.finalPriceUsd || data.valueUsd || 0),
          },
          after: {
            discountPct,
            finalPriceUsd,
          },
        },
      });

      const watcherIds = await getWatcherUserIds(tenantId);
      await notifyUsers({
        userIds: watcherIds,
        title: "Discount approval needed",
        body: `${actorName} requested ${discountPct}% discount on deal ${data.dealName || data.leadName || "Deal"}.`,
        deepLink: "/sales_manager/deals",
        entityType: "deal",
        entityId: id,
        createdBy: { uid: auth.user.uid, name: actorName },
        tenantId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("sales deals update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update deal." }, { status: 500 });
  }
}
