import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../../_utils";

export const dynamic = "force-dynamic";

function canCreateClient(role: string) {
  const r = (role || "").toLowerCase();
  return r === "super_admin" || r === "admin" || r === "sales_manager" || r === "sales";
}

function cleanString(v: any) {
  return String(v ?? "").trim();
}

function normalizeEmail(v: string) {
  return cleanString(v).toLowerCase();
}

function toNumber(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function canonicalPaymentStatus(input: any): "Unpaid" | "Partially Paid" | "Paid" {
  const s = String(input ?? "").trim().toLowerCase();
  if (s === "paid") return "Paid";
  if (s === "partially paid" || s === "partial" || s === "partially_paid" || s === "partiallypaid") return "Partially Paid";
  return "Unpaid";
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canCreateClient(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const companyName = cleanString(body?.companyName);
  const primaryContactName = cleanString(body?.primaryContactName);
  const primaryContactEmail = cleanString(body?.primaryContactEmail);
  const salesOwner = cleanString(body?.salesOwner);
  const primaryContactEmailLower = normalizeEmail(primaryContactEmail);

  if (!companyName) return NextResponse.json({ ok: false, error: "Company Name is required" }, { status: 400 });
  if (!primaryContactName) return NextResponse.json({ ok: false, error: "Primary Contact Name is required" }, { status: 400 });
  if (!primaryContactEmail) return NextResponse.json({ ok: false, error: "Primary Contact Email is required" }, { status: 400 });
  if (!salesOwner) return NextResponse.json({ ok: false, error: "Sales Owner is required" }, { status: 400 });

  // Enforce 1 email per account (ignore deleted clients)
  const existingByLower = await db
    .collection("clients")
    .where("primaryContactEmailLower", "==", primaryContactEmailLower)
    .limit(1)
    .get();

  const existingByRaw = await db
    .collection("clients")
    .where("primaryContactEmail", "==", primaryContactEmail)
    .limit(1)
    .get();

  const duplicate =
    existingByLower.docs.concat(existingByRaw.docs).find((doc) => {
      const data = doc.data() || {};
      return !data.deletedAt;
    }) || null;

  if (duplicate) {
    return NextResponse.json({ ok: false, error: "Primary contact email already exists" }, { status: 400 });
  }

  // IMPORTANT: Order ID is ONLY for paid clients. So on create we DO NOT generate it.
  // Payment status defaults to Unpaid unless (optional) admin wants to create as paid via update flow.
  const paymentStatus = "Unpaid" as const;

  const now = admin.firestore.FieldValue.serverTimestamp();

  const doc = {
    // Company
    companyName,
    website: cleanString(body?.website),
    industry: cleanString(body?.industry),
    country: cleanString(body?.country),
    timezone: cleanString(body?.timezone),

    // Contact
    primaryContactName,
    primaryContactTitle: cleanString(body?.primaryContactTitle),
    primaryContactEmail,
    primaryContactEmailLower,
    primaryContactPhone: cleanString(body?.primaryContactPhone),

    // Lifecycle
    salesStage: cleanString(body?.salesStage) || "New Lead",
    paymentStatus,
    retainerStatus: cleanString(body?.retainerStatus) || "None",

    // Ownership
    salesOwner,
    accountManager: cleanString(body?.accountManager),
    productionOwner: cleanString(body?.productionOwner),

    // Finance
    totalContractValueUsd: toNumber(body?.totalContractValueUsd),
    totalPaidUsd: toNumber(body?.totalPaidUsd), // stored but status remains Unpaid until admin updates paymentStatus
    openBalanceUsd: toNumber(body?.openBalanceUsd),

    // Notes
    services: cleanString(body?.services),

    // Paid account identifier (ONLY generated when paid/partially paid)
    orderId: "",

    // Timestamps
    createdAt: now,
    updatedAt: now,
    lastActivity: now,
  };

  // If someone tries to sneak Paid in create payload, ignore it.
  // (Paid must be done via update and only admin/super_admin).
  // We keep this for clarity:
  void canonicalPaymentStatus(body?.paymentStatus);

  try {
    const ref = await db.collection("clients").add(doc);
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to create client" }, { status: 500 });
  }
}
