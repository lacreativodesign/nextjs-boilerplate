import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance } from "../../_utils";

export const dynamic = "force-dynamic";

function toCSV(rows: string[][]) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export async function GET() {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = auth.user.tenantId || "";
    const [tenantSnap, snap] = await Promise.all([
      adminDb.collection("tenants").doc(tenantId).get(),
      adminDb.collection("payroll").where("tenantId", "==", tenantId).where("isDeleted", "==", false).limit(500).get(),
    ]);
    const tenantCurrency = String(tenantSnap.data()?.settings?.currency || "USD").trim() || "USD";
    const totals = new Map<string, number>();

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const month = String(data.month || "");
      if (!month) return;
      const total = Number(data.baseSalaryPkr || 0) + Number(data.commissionPkr || 0);
      totals.set(month, (totals.get(month) || 0) + total);
    });

    const rows = [["Month", `Payroll ${tenantCurrency}`]];
    Array.from(totals.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([month, total]) => {
        rows.push([month, total.toFixed(2)]);
      });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=finance-payroll-by-month.csv",
      },
    });
  } catch (err: any) {
    console.error("finance/reports payroll-by-month error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
