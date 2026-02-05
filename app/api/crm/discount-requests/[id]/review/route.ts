import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { canApproveDiscount, requireCrmUser } from "@/lib/crm";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireCrmUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canApproveDiscount(auth.user.role)) {
    return NextResponse.json({ ok: false, error: "Only sales manager can review requests." }, { status: 403 });
  }

  const payload = await req.json();
  const decision = String(payload.decision || "");
  if (!["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ ok: false, error: "decision must be approved or rejected" }, { status: 400 });
  }

  const reqRef = adminDb.collection("discountRequests").doc(params.id);
  await adminDb.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) throw new Error("Request not found");

    const discountRequest = reqSnap.data() || {};
    if (discountRequest.tenantId !== auth.tenantId) {
      throw new Error("Forbidden");
    }

    tx.set(
      reqRef,
      {
        status: decision,
        reviewedBy: auth.user.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (discountRequest.dealId) {
      tx.set(
        adminDb.collection("deals").doc(String(discountRequest.dealId)),
        {
          discountApproved: decision === "approved",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  return NextResponse.json({ ok: true });
}
