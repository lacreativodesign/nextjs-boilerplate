import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance } from "@/app/api/finance/_utils";

export const runtime = "nodejs";

const csvEscape = (value: unknown) => {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export async function GET(_: Request, { params }: { params: { reportId: string } }) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const reportId = String(params.reportId || "").trim();
    const reportSnap = await adminDb.collection("tax_reports").doc(reportId).get();
    if (!reportSnap.exists) {
      return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });
    }

    const report = reportSnap.data() || {};
    if (String(report.tenantId || "") !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });
    }

    const startDate = new Date(String(report.startDate || ""));
    const endDate = new Date(String(report.endDate || ""));

    const invoicesSnap = await adminDb
      .collection("invoices")
      .where("tenantId", "==", auth.user.tenantId)
      .where("status", "==", "paid")
      .where("paidAt", ">=", startDate)
      .where("paidAt", "<=", endDate)
      .get();

    const headers = ["Invoice ID", "Order ID", "Client", "Issue Date", "Paid Date", "Subtotal", "Tax Rate", "Tax Amount", "Total"];
    const rows = invoicesSnap.docs.map((doc) => {
      const invoice = doc.data() || {};
      return [
        doc.id,
        String(invoice.orderId || ""),
        String(invoice.clientName || invoice.clientId || ""),
        String(invoice.issuedAt?.toDate?.()?.toISOString?.() || invoice.issuedAt || ""),
        String(invoice.paidAt?.toDate?.()?.toISOString?.() || invoice.paidAt || ""),
        Number(invoice.subtotal ?? invoice.amountSubtotal ?? 0).toFixed(2),
        invoice.taxRate !== undefined && invoice.taxRate !== null ? `${Number(invoice.taxRate).toFixed(2)}%` : "",
        Number(invoice.taxAmount ?? invoice.amountTax ?? 0).toFixed(2),
        Number(invoice.totalAmount ?? invoice.amountTotal ?? 0).toFixed(2),
      ];
    });

    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="tax-report-${String(report.period || reportId)}.csv"`,
      },
    });
  } catch (error) {
    console.error("[TAX_REPORT_EXPORT]", error);
    return NextResponse.json({ ok: false, error: "Failed to export report" }, { status: 500 });
  }
}
