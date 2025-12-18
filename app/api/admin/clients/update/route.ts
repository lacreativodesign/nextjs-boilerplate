import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { db } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../../_utils";

export const dynamic = "force-dynamic";

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const ref = db.collection("clients").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const patch: any = {
      companyName: String(body.companyName || "").trim(),
      website: String(body.website || "").trim(),
      industry: String(body.industry || "").trim(),
      country: String(body.country || "").trim(),
      timezone: String(body.timezone || "").trim(),

      primaryContactName: String(body.primaryContactName || "").trim(),
      primaryContactTitle: String(body.primaryContactTitle || "").trim(),
      primaryContactEmail: String(body.primaryContactEmail || "").trim(),
      primaryContactPhone: String(body.primaryContactPhone || "").trim(),

      salesStage: String(body.salesStage || "New Lead"),
      paymentStatus: String(body.paymentStatus || "Unpaid"),
      retainerStatus: String(body.retainerStatus || "None"),

      salesOwner: String(body.salesOwner || "").trim(),
      accountManager: String(body.accountManager || "").trim(),
      productionOwner: String(body.productionOwner || "").trim(),

      totalPaidUsd: num(body.totalPaidUsd),
      totalContractValueUsd: num(body.totalContractValueUsd),
      openBalanceUsd: num(body.openBalanceUsd),
      services: String(body.services || "").trim(),

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActivity: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: me.uid,
    };

    // Never allow changing orderId
    delete patch.orderId;

    await ref.set(patch, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Failed to update client" }, { status: 500 });
  }
}
