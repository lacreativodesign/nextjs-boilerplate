import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { db } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../../_utils";

export const dynamic = "force-dynamic";

function pad4(n: number) {
  return String(n).padStart(4, "0");
}

async function nextOrderIdLC(): Promise<string> {
  // Using your existing collection: "Order IDs" doc: "counter" field: seq
  const ref = db.collection("Order IDs").doc("counter");

  const out = await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const current = Number(snap.exists ? snap.data()?.seq : 0) || 0;
    const next = current + 1;
    tx.set(ref, { seq: next }, { merge: true });
    return next;
  });

  return `LC-${pad4(out)}`;
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));

    // Required minimal validation
    if (!body?.companyName || !body?.primaryContactEmail) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: companyName, primaryContactEmail" },
        { status: 400 }
      );
    }

    const orderId = await nextOrderIdLC();

    const now = admin.firestore.FieldValue.serverTimestamp();

    const doc = {
      // Company
      companyName: String(body.companyName || "").trim(),
      website: String(body.website || "").trim(),
      industry: String(body.industry || "").trim(),
      country: String(body.country || "").trim(),
      timezone: String(body.timezone || "").trim(),

      // Contact
      primaryContactName: String(body.primaryContactName || "").trim(),
      primaryContactTitle: String(body.primaryContactTitle || "").trim(),
      primaryContactEmail: String(body.primaryContactEmail || "").trim(),
      primaryContactPhone: String(body.primaryContactPhone || "").trim(),

      // Status
      salesStage: String(body.salesStage || "New Lead"),
      paymentStatus: String(body.paymentStatus || "Unpaid"),
      retainerStatus: String(body.retainerStatus || "None"),

      // Owners
      salesOwner: String(body.salesOwner || "").trim(),
      accountManager: String(body.accountManager || "").trim(),
      productionOwner: String(body.productionOwner || "").trim(),

      // Money
      totalPaidUsd: num(body.totalPaidUsd),
      totalContractValueUsd: num(body.totalContractValueUsd),
      openBalanceUsd: num(body.openBalanceUsd),

      // Notes
      services: String(body.services || "").trim(),

      // System
      orderId,
      createdAt: now,
      updatedAt: now,
      lastActivity: now,
      createdBy: me.uid,
    };

    const ref = await db.collection("clients").add(doc);

    return NextResponse.json({ ok: true, id: ref.id, orderId });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Failed to create client" }, { status: 500 });
  }
}
