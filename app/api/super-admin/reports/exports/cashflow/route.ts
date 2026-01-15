import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "../../../_utils";
import { getTenantIdForRequestOrThrow } from "@/lib/tenant/server";
import { computeCashflow, loadFinancialDocuments, resolveDateRange } from "@/lib/reports/financials";

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

    const docs = await loadFinancialDocuments(tenantId);
    const summary = computeCashflow({ invoices: docs.invoices, payments: docs.payments, range });

    const rows = [
      ["Metric", "Value (USD)"],
      ["Invoices issued", summary.invoicesIssuedUsd.toFixed(2)],
      ["Payments received", summary.paymentsReceivedUsd.toFixed(2)],
      ["Outstanding balance", summary.outstandingBalanceUsd.toFixed(2)],
      ["Overdue invoices (count)", String(summary.overdueInvoicesCount)],
    ];

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=reports-cashflow.csv",
      },
    });
  } catch (err: any) {
    console.error("super-admin reports/exports cashflow error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
