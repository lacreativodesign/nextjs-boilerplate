import { NextResponse } from "next/server";
import { requireAdmin } from "../_utils";
import { loadFinancialDocuments, resolveDateRange, computeCashflow } from "@/lib/reports/financials";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const range = resolveDateRange({
      range: searchParams.get("range"),
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
    });

    const docs = await loadFinancialDocuments(auth.user.tenantId);
    const summary = computeCashflow({
      invoices: docs.invoices,
      payments: docs.payments,
      range,
    });

    return NextResponse.json({
      ok: true,
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
      summary,
    });
  } catch (err: any) {
    console.error("reports cashflow error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load cashflow report.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
