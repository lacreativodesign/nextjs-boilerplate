import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getMonthKey, requireReportsAccess, toMillis } from "../../_utils";
import { normalizePaymentStatus } from "@/lib/finance/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toCSV(rows: string[][]) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export async function GET() {
  try {
    const auth = await requireReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb.collection("payments").where("isDeleted", "==", false).limit(500).get();
    const totals = new Map<string, number>();

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (normalizePaymentStatus(data.status) !== "succeeded") return;
      const paidMs = toMillis(data.paidAt || data.updatedAt || data.createdAt);
      if (!paidMs) return;
      const key = getMonthKey(new Date(paidMs));
      totals.set(key, (totals.get(key) || 0) + Number(data.amountUsd || 0));
    });

    const rows = [["Month", "Payments USD"]];
    Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([month, total]) => {
        rows.push([month, total.toFixed(2)]);
      });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=reports-payments-by-month.csv",
      },
    });
  } catch (err: any) {
    console.error("reports/exports payments-by-month error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
