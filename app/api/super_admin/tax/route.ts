import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "@/app/api/super_admin/_utils";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") || new Date().getFullYear());

    const tenantsSnap = await adminDb.collection("tenants").get();

    const quarterlyTotals: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    const monthlyTotals: Record<string, number> = {};
    let yearTotal = 0;
    let allTimeTaxCollected = 0;

    const tenantBreakdown: Array<{
      tenantId: string;
      tenantName: string;
      plan: string;
      taxPaid: number;
      lastTaxAt: string | null;
    }> = [];

    for (const doc of tenantsSnap.docs) {
      const data = doc.data() || {};
      const taxAmount = Number(data.lastInvoiceTax || 0);
      const taxAt = String(data.lastInvoiceTaxAt || data.lastPaymentAt || "");

      if (taxAmount > 0) {
        allTimeTaxCollected += taxAmount;

        if (taxAt) {
          const date = new Date(taxAt);
          if (!isNaN(date.getTime())) {
            const txYear = date.getFullYear();
            const txMonth = date.getMonth();

            if (txYear === year) {
              yearTotal += taxAmount;
              const quarter =
                txMonth < 3 ? "Q1" :
                txMonth < 6 ? "Q2" :
                txMonth < 9 ? "Q3" : "Q4";
              quarterlyTotals[quarter] = (quarterlyTotals[quarter] || 0) + taxAmount;
              const monthKey = `${year}-${String(txMonth + 1).padStart(2, "0")}`;
              monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + taxAmount;
            }
          }
        }

        tenantBreakdown.push({
          tenantId: doc.id,
          tenantName: String(data.name || doc.id),
          plan: String(data.plan || "trial"),
          taxPaid: parseFloat(taxAmount.toFixed(2)),
          lastTaxAt: taxAt || null,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      year,
      yearTotal: parseFloat(yearTotal.toFixed(2)),
      allTimeTaxCollected: parseFloat(allTimeTaxCollected.toFixed(2)),
      quarterlyTotals: Object.fromEntries(
        Object.entries(quarterlyTotals).map(([k, v]) => [k, parseFloat(v.toFixed(2))])
      ),
      monthlyTotals: Object.fromEntries(
        Object.entries(monthlyTotals)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, parseFloat(v.toFixed(2))])
      ),
      tenantBreakdown: tenantBreakdown.sort((a, b) => b.taxPaid - a.taxPaid),
      taxJurisdiction: "Texas, USA — 8.25% Sales Tax",
      businessEntity: "LA CREATIVO GROUP, LLC",
      filingSchedule: "Quarterly — Texas Comptroller Form 01-117",
    });
  } catch (err: any) {
    console.error("[SUPER_ADMIN_TAX]", err);
    return NextResponse.json({ ok: false, error: err.message || "Failed to load tax data." }, { status: 500 });
  }
}
