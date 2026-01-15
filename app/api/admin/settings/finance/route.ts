import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  DEFAULT_FINANCE_SETTINGS,
  canEditSection,
  parseBoolean,
  parseNumber,
  parseNumberArray,
  parseString,
  parseStringArray,
  requireAdmin,
  serverTimestamp,
  toISO,
  logSettingsChange,
} from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb.collection("settings").doc("finance").get();
    const data = snap.exists ? snap.data() : {};

    const settings = {
      invoicePrefix: parseString(data?.invoicePrefix, DEFAULT_FINANCE_SETTINGS.invoicePrefix),
      invoiceCounter: parseNumber(data?.invoiceCounter, DEFAULT_FINANCE_SETTINGS.invoiceCounter),
      paymentMethods: parseStringArray(data?.paymentMethods),
      arBuckets: parseNumberArray(data?.arBuckets, DEFAULT_FINANCE_SETTINGS.arBuckets),
      payrollApprovalRequired: parseBoolean(data?.payrollApprovalRequired, DEFAULT_FINANCE_SETTINGS.payrollApprovalRequired),
      lockPastMonths: parseBoolean(data?.lockPastMonths, DEFAULT_FINANCE_SETTINGS.lockPastMonths),
      fxPkrPerUsd: parseNumber(data?.fxPkrPerUsd, DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd),
      updatedAt: toISO(data?.updatedAt),
      updatedBy: data?.updatedBy || null,
    };

    return NextResponse.json({
      ok: true,
      settings,
      canEdit: canEditSection(auth.user.role, "finance"),
      role: auth.user.role,
    });
  } catch (err) {
    console.error("settings/finance get error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!canEditSection(auth.user.role, "finance")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const payload = {
      invoicePrefix: parseString(body?.invoicePrefix, DEFAULT_FINANCE_SETTINGS.invoicePrefix),
      invoiceCounter: parseNumber(body?.invoiceCounter, DEFAULT_FINANCE_SETTINGS.invoiceCounter),
      paymentMethods: parseStringArray(body?.paymentMethods),
      arBuckets: parseNumberArray(body?.arBuckets, DEFAULT_FINANCE_SETTINGS.arBuckets),
      payrollApprovalRequired: parseBoolean(body?.payrollApprovalRequired, DEFAULT_FINANCE_SETTINGS.payrollApprovalRequired),
      lockPastMonths: parseBoolean(body?.lockPastMonths, DEFAULT_FINANCE_SETTINGS.lockPastMonths),
      fxPkrPerUsd: parseNumber(body?.fxPkrPerUsd, DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd),
      updatedAt: serverTimestamp(),
      updatedBy: auth.user.uid,
    };

    await adminDb.collection("settings").doc("finance").set(payload, { merge: true });

    await logSettingsChange({
      user: auth.user,
      section: "finance",
      summary: "Finance settings updated.",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings/finance update error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
