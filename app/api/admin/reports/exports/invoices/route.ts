import { NextResponse } from "next/server";
import { requireAdmin } from "../../_utils";
import { loadFinancialDocuments, resolveDateRange } from "@/lib/reports/financials";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

function toCSV(rows: string[][]) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

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
    const startMs = range.start.getTime();
    const endMs = range.end.getTime();

    const rows = [["Invoice ID", "Client", "Amount USD", "Status", "Issued At", "Due Date"]];
    docs.invoices.forEach((invoice) => {
      const issuedMs = toMillis(invoice.issuedAt || invoice.createdAt);
      if (!issuedMs || issuedMs < startMs || issuedMs > endMs) return;
      rows.push([
        String(invoice.orderId || invoice.id || ""),
        String(invoice.clientName || "Client"),
        Number(invoice.amountTotalUsd || 0).toFixed(2),
        String(invoice.status || ""),
        issuedMs ? new Date(issuedMs).toISOString() : "",
        invoice.dueDate ? new Date(toMillis(invoice.dueDate) || issuedMs || Date.now()).toISOString() : "",
      ]);
    });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=reports-invoices.csv",
      },
    });
  } catch (err: any) {
    console.error("reports/exports invoices error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
