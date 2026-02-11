import { NextResponse } from "next/server";
import { requireFinance } from "@/app/api/finance/_utils";
import { resolveErrorResponse } from "@/lib/errors";
import { adminDb } from "@/lib/firebaseAdmin";
import { logError } from "@/lib/logging";
import { checkRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

interface TaxSummaryEntry {
  taxRateName: string;
  taxRate: number;
  totalTaxCollected: number;
  invoiceCount: number;
}

export async function GET(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, "standard", auth.user.uid);

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { ok: false, error: "Start date and end date are required" },
        { status: 400 },
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return NextResponse.json({ ok: false, error: "Invalid date range" }, { status: 400 });
    }

    const invoicesSnap = await adminDb
      .collection("invoices")
      .where("tenantId", "==", auth.user.tenantId)
      .where("createdAt", ">=", start)
      .where("createdAt", "<=", end)
      .get();

    const taxSummary: Record<string, TaxSummaryEntry> = {};
    let totalTaxCollected = 0;

    invoicesSnap.docs.forEach((doc) => {
      const invoice = doc.data();
      const taxAmount = Number(invoice.amountTax || 0);
      const taxRateId = String(invoice.taxRateId || "no_tax");
      const taxRateName = String(invoice.taxRateName || "No Tax");
      const taxRate = Number(invoice.taxRate || 0);

      if (!taxSummary[taxRateId]) {
        taxSummary[taxRateId] = {
          taxRateName,
          taxRate,
          totalTaxCollected: 0,
          invoiceCount: 0,
        };
      }

      taxSummary[taxRateId].totalTaxCollected += taxAmount;
      taxSummary[taxRateId].invoiceCount += 1;
      totalTaxCollected += taxAmount;
    });

    return NextResponse.json({
      ok: true,
      report: {
        startDate,
        endDate,
        totalTaxCollected,
        taxByRate: Object.values(taxSummary),
        invoiceCount: invoicesSnap.size,
      },
    });
  } catch (err) {
    logError(err, { route: "GET /api/finance/reports/tax" });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Failed to generate tax report",
    });
    return NextResponse.json(body, { status });
  }
}
