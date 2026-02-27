import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance } from "@/app/api/finance/_utils";

export const runtime = "nodejs";

type PeriodType = "monthly" | "quarterly" | "yearly";

type GenerateBody = {
  periodType?: PeriodType;
  year?: number;
  month?: number;
  quarter?: number;
};

function toDateRange({ periodType, year, month, quarter }: Required<Pick<GenerateBody, "periodType" | "year">> & Pick<GenerateBody, "month" | "quarter">) {
  if (periodType === "monthly") {
    const m = Number(month);
    if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error("month is required for monthly reports");
    return {
      startDate: new Date(Date.UTC(year, m - 1, 1, 0, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, m, 0, 23, 59, 59, 999)),
      period: `${year}-${String(m).padStart(2, "0")}`,
    };
  }

  if (periodType === "quarterly") {
    const q = Number(quarter);
    if (!Number.isInteger(q) || q < 1 || q > 4) throw new Error("quarter is required for quarterly reports");
    const startMonth = (q - 1) * 3;
    return {
      startDate: new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999)),
      period: `${year}-Q${q}`,
    };
  }

  return {
    startDate: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    period: `${year}`,
  };
}

export async function GET() {
  try {
    const auth = await requireFinance();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const snapshot = await adminDb
      .collection("tax_reports")
      .where("tenantId", "==", auth.user.tenantId)
      .orderBy("generatedAt", "desc")
      .get();

    const reports = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ ok: true, reports });
  } catch (error) {
    console.error("[TAX_REPORTS_GET]", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch reports" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = (await req.json().catch(() => ({}))) as GenerateBody;
    const periodType = body.periodType;
    const year = Number(body.year);
    if (!periodType || !["monthly", "quarterly", "yearly"].includes(periodType)) {
      return NextResponse.json({ ok: false, error: "Invalid periodType" }, { status: 400 });
    }
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      return NextResponse.json({ ok: false, error: "Invalid year" }, { status: 400 });
    }

    const range = toDateRange({ periodType, year, month: body.month, quarter: body.quarter });

    const invoicesSnap = await adminDb
      .collection("invoices")
      .where("tenantId", "==", auth.user.tenantId)
      .where("status", "==", "paid")
      .where("paidAt", ">=", range.startDate)
      .where("paidAt", "<=", range.endDate)
      .get();

    let totalTaxableAmount = 0;
    let totalTaxCollected = 0;
    const taxBreakdownMap = new Map<string, { taxRateId: string; rateName: string; rate: number; taxableAmount: number; taxCollected: number }>();

    invoicesSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const taxableAmount = Number(data.subtotal ?? data.amountSubtotal ?? 0);
      const taxAmount = Number(data.taxAmount ?? data.amountTax ?? 0);
      const taxRateId = String(data.taxRateId || "no-tax");
      const rateName = String(data.taxRateName || "No Tax");
      const rate = Number(data.taxRate || 0);

      totalTaxableAmount += taxableAmount;
      totalTaxCollected += taxAmount;

      const existing = taxBreakdownMap.get(taxRateId) || {
        taxRateId,
        rateName,
        rate,
        taxableAmount: 0,
        taxCollected: 0,
      };
      existing.taxableAmount += taxableAmount;
      existing.taxCollected += taxAmount;
      taxBreakdownMap.set(taxRateId, existing);
    });

    const reportRef = adminDb.collection("tax_reports").doc();
    const report = {
      id: reportRef.id,
      tenantId: auth.user.tenantId,
      period: range.period,
      periodType,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      totalTaxableAmount: parseFloat(totalTaxableAmount.toFixed(2)),
      totalTaxCollected: parseFloat(totalTaxCollected.toFixed(2)),
      taxBreakdown: Array.from(taxBreakdownMap.values()).map((entry) => ({
        ...entry,
        taxableAmount: parseFloat(entry.taxableAmount.toFixed(2)),
        taxCollected: parseFloat(entry.taxCollected.toFixed(2)),
      })),
      invoiceCount: invoicesSnap.size,
      generatedAt: new Date().toISOString(),
      generatedBy: auth.user.uid,
      status: "draft" as const,
    };

    await reportRef.set(report);
    return NextResponse.json({ ok: true, report });
  } catch (error: any) {
    console.error("[TAX_REPORTS_POST]", error);
    return NextResponse.json({ ok: false, error: error?.message || "Failed to generate report" }, { status: 500 });
  }
}
