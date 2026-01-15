import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "../../_utils";
import { getTenantIdForRequestOrThrow } from "@/lib/tenant/server";
import { DEFAULT_FINANCE_SETTINGS, getFinanceSettings } from "../../../admin/settings/_utils";
import {
  computeClientProfitability,
  loadFinancialDocuments,
  resolveDateRange,
} from "@/lib/reports/financials";

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

    const financeSettings = await getFinanceSettings();
    const fxPkrPerUsdRaw = Number(financeSettings.fxPkrPerUsd || DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd);
    const fxPkrPerUsd = fxPkrPerUsdRaw > 0 ? fxPkrPerUsdRaw : DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd;

    const docs = await loadFinancialDocuments(tenantId);
    const clients = computeClientProfitability({
      payments: docs.payments,
      expenses: docs.expenses,
      payroll: docs.payroll,
      clients: docs.clients,
      range,
      fxPkrPerUsd,
    });

    return NextResponse.json({
      ok: true,
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
      clients,
    });
  } catch (err: any) {
    console.error("super-admin reports client profitability error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load client profitability report.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
