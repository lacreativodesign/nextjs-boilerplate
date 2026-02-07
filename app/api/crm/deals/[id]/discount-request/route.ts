import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { canManageOwnDeals, requireCrmUser } from "@/lib/crm";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireCrmUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canManageOwnDeals(auth.user.role)) {
    return NextResponse.json({ ok: false, error: "Only sales can request discounts." }, { status: 403 });
  }

  const payload = await req.json();
  const discountPercent = Number(payload.discountPercent || 0);
  const reason = String(payload.reason || "").trim();

  const dealRef = adminDb.collection("deals").doc(params.id);
  const requestRef = adminDb.collection("discountRequests").doc();

  if (discountPercent <= 0) {
    return NextResponse.json({ ok: false, error: "discountPercent must be greater than 0." }, { status: 400 });
  }

  await adminDb.runTransaction(async (tx) => {
    const dealSnap = await tx.get(dealRef);
    if (!dealSnap.exists) throw new Error("Deal not found");
    const deal = dealSnap.data() || {};

    if (deal.assignedSalesId !== auth.user.uid || deal.tenantId !== auth.tenantId) {
      throw new Error("Forbidden");
    }

    const isAutoApproved = discountPercent <= 20;

    tx.set(
      dealRef,
      {
        discountPercent,
        discountApproved: isAutoApproved,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (!isAutoApproved) {
      tx.set(requestRef, {
        id: requestRef.id,
        dealId: params.id,
        requestedBy: auth.user.uid,
        discountPercent,
        reason,
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
        tenantId: auth.tenantId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  return NextResponse.json({ ok: true, autoApproved: discountPercent <= 20 });
}
