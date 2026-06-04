import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireReportsAccess, toISO } from "../../_utils";
import { normalizeInvoiceStatus, toInvoiceStatusLabel } from "@/lib/finance/status";
import { toCSV, toExcel, toPDF } from "@/lib/exports/formatters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await requireReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const clientId = String(searchParams.get("clientId") || "").trim();
    const format = searchParams.get("format") || "csv";

    const snap = await adminDb.collection("invoices").where("tenantId", "==", auth.user.tenantId).where("isDeleted", "==", false).limit(500).get();
    const rows = [["Invoice", "Client", "Amount USD", "Due Date", "Status"]];

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const normalizedStatus = normalizeInvoiceStatus(data.status);
      if (["paid", "void"].includes(normalizedStatus)) return;
      if (clientId && String(data.clientId || "") !== clientId) return;
      rows.push([
        String(data.orderId || doc.id),
        String(data.clientName || "Unknown"),
        Number(data.amountTotalUsd || 0).toFixed(2),
        toISO(data.dueDate) || "",
        toInvoiceStatusLabel(normalizedStatus),
      ]);
    });

    if (format === "xlsx") {
      const buffer = toExcel(rows, "Outstanding AR");
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=reports-outstanding-ar.xlsx",
        },
      });
    } else if (format === "pdf") {
      const buffer = await toPDF(rows, "Outstanding AR");
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename=reports-outstanding-ar.pdf",
        },
      });
    } else {
      const csv = toCSV(rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=reports-outstanding-ar.csv",
        },
      });
    }
  } catch (err: any) {
    console.error("reports/exports outstanding-ar error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
