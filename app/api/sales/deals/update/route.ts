import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";
import { logEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import {
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

    const updates: Record<string, any> = {
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
    } else if (discountPct <= 20) {
      updates.discountApproved = true;
      updates.discountStatus = "auto_approved";
      updates.discountRequestedAt = serverTimestamp();
      updates.discountRequestedByUid = auth.user.uid;
      updates.discountApprovedAt = serverTimestamp();
      updates.discountApprovedByUid = auth.user.uid;
      updates.discountApprovedByName = actorName;
    } else {
      updates.discountApproved = false;
      updates.discountStatus = "pending";
      updates.discountRequestedAt = serverTimestamp();
      updates.discountRequestedByUid = auth.user.uid;
      updates.discountApprovedAt = null;
      updates.discountApprovedByUid = null;
      updates.discountApprovedByName = null;
    }

    await dealRef.set(updates, { merge: true });

    if (discountPct > 0 && discountPct <= 20) {
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

    if (discountPct > 20) {
      await logEvent({
        tenantId,
        type: "sales.discount.requested",
        title: "Discount approval requested",
        description: `${data.dealName || data.leadName || "Deal"} requested ${discountPct}% discount.`,
        entityType: "deal",
        entityId: id,
        actor: { uid: auth.user.uid, name: actorName },
        metadata: { discountPct, listPriceUsd, finalPriceUsd },
      });

      const watcherIds = await getWatcherUserIds(tenantId);
      await notifyUsers({
        userIds: watcherIds,
        title: "Discount approval needed",
        body: `${actorName} requested ${discountPct}% discount on deal ${data.dealName || data.leadName || "Deal"}.`,
        deepLink: "/sales-manager/deals",
        entityType: "deal",
        entityId: id,
        createdBy: { uid: auth.user.uid, name: actorName },
        tenantId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales deals update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update deal." }, { status: 500 });
  }
}
