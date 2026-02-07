import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { canCreateLeads, requireCrmUser } from "@/lib/crm";

export async function POST(req: Request) {
  const auth = await requireCrmUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canCreateLeads(auth.user.role)) {
    return NextResponse.json({ ok: false, error: "Only sales can convert leads." }, { status: 403 });
  }

  const payload = await req.json();
  const leadId = String(payload.leadId || "");
  const title = String(payload.title || "").trim() || "New deal";
  const valueUSD = Number(payload.valueUSD || 0);

  if (!leadId) return NextResponse.json({ ok: false, error: "leadId is required" }, { status: 400 });

  const leadRef = adminDb.collection("leads").doc(leadId);
  const dealRef = adminDb.collection("deals").doc();

  await adminDb.runTransaction(async (tx) => {
    const leadSnap = await tx.get(leadRef);
    if (!leadSnap.exists) throw new Error("Lead not found");
    const lead = leadSnap.data() || {};

    if (String(lead.createdBy || "") !== auth.user.uid) {
      throw new Error("Forbidden");
    }

    tx.set(dealRef, {
      id: dealRef.id,
      leadId,
      title,
      valueUSD,
      stage: "new",
      discountPercent: 0,
      discountApproved: true,
      assignedSalesId: auth.user.uid,
      tenantId: auth.tenantId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(
      leadRef,
      {
        status: "converted",
      },
      { merge: true }
    );
  });

  return NextResponse.json({ ok: true, dealId: dealRef.id });
}
