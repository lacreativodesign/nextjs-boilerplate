import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "../../_utils";
import { getTenantIdForRequestOrThrow } from "@/lib/tenant/server";
import { computeCashflow, loadFinancialDocuments, resolveDateRange } from "@/lib/reports/financials";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const tenantId = await getTenantIdForRequestOrThrow(req);

    const { searchParams } = new URL(req.url);
    const range = resolveDateRange({
      range: searchParams.get("range"),
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
    });

    const docs = await loadFinancialDocuments(tenantId);
    const summary = computeCashflow({ invoices: docs.invoices, payments: docs.payments, range });

    return NextResponse.json({
      ok: true,
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
      summary,
    });
  } catch (err: any) {
    console.error("super-admin reports cashflow error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load cashflow report.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
