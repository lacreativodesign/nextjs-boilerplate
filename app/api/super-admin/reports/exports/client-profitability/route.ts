import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "../../../_utils";
import { getTenantIdForRequestOrThrow } from "@/lib/tenant/server";
import { DEFAULT_FINANCE_SETTINGS, getFinanceSettings } from "../../../../admin/settings/_utils";
import { computeClientProfitability, loadFinancialDocuments, resolveDateRange } from "@/lib/reports/financials";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

function toCSV(rows: string[][]) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

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

    const rows = [["Client", "Revenue USD", "Estimated Cost USD", "Profit USD", "Margin %", "Flag"]];
    clients.forEach((client) => {
      rows.push([
        client.clientName,
        client.revenueUsd.toFixed(2),
        client.estimatedCostUsd.toFixed(2),
        client.profitUsd.toFixed(2),
        client.marginPct.toFixed(2),
        client.flagLowMargin ? "LOW MARGIN" : "",
      ]);
    });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=reports-client-profitability.csv",
      },
    });
  } catch (err: any) {
    console.error("super-admin reports/exports client-profitability error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
