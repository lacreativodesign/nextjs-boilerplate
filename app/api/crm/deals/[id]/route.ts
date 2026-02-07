import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  canManageOwnDeals,
  canMoveStage,
  createClientFromClosedWonDeal,
  requireCrmUser,
  toIso,
} from "@/lib/crm";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const auth = await requireCrmUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const snap = await adminDb.collection("deals").doc(params.id).get();
  if (!snap.exists) return NextResponse.json({ ok: false, error: "Deal not found" }, { status: 404 });
  const data = snap.data() || {};
  if (data.tenantId !== auth.tenantId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  if (auth.user.role === "sales" && data.assignedSalesId !== auth.user.uid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    deal: {
      id: snap.id,
      leadId: String(data.leadId || ""),
      title: String(data.title || ""),
      valueUSD: Number(data.valueUSD || 0),
      stage: String(data.stage || "new"),
      discountPercent: Number(data.discountPercent || 0),
      discountApproved: Boolean(data.discountApproved),
      assignedSalesId: String(data.assignedSalesId || ""),
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireCrmUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canManageOwnDeals(auth.user.role)) {
    return NextResponse.json({ ok: false, error: "Only sales can update deal stages." }, { status: 403 });
  }

  const payload = await req.json();
  const nextStage = String(payload.stage || "");
  if (!nextStage) return NextResponse.json({ ok: false, error: "stage is required" }, { status: 400 });

  const ref = adminDb.collection("deals").doc(params.id);
  let shouldTrigger = false;
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Deal not found");
    const data = snap.data() || {};

    if (data.assignedSalesId !== auth.user.uid || data.tenantId !== auth.tenantId) {
      throw new Error("Forbidden");
    }

    if (!canMoveStage(data.stage, nextStage)) {
      throw new Error("Stage skip is not allowed");
    }

    if (nextStage === "closed_won" && Number(data.discountPercent || 0) > 0 && !data.discountApproved) {
      throw new Error("Discount must be approved before closing as won");
    }

    tx.set(
      ref,
      {
        stage: nextStage,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (nextStage === "closed_won") {
      shouldTrigger = true;
    }
  });

  if (shouldTrigger) {
    await createClientFromClosedWonDeal({
      dealId: params.id,
      actor: {
        uid: auth.user.uid,
        name: auth.user.name || auth.user.fullName || null,
        tenantId: auth.tenantId,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
