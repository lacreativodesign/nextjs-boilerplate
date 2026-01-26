import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance, toISO } from "../../_utils";
import { normalizePaymentStatus } from "@/lib/finance/status";

export const dynamic = "force-dynamic";

function toCSV(rows: string[][]) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function monthKey(value: any) {
  const iso = toISO(value);
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb.collection("payments").where("isDeleted", "==", false).limit(500).get();
    const totals = new Map<string, number>();

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (normalizePaymentStatus(data.status) !== "succeeded") return;
      const key = monthKey(data.paidAt || data.createdAt);
      if (!key) return;
      totals.set(key, (totals.get(key) || 0) + Number(data.amountUsd || 0));
    });

    const rows = [["Month", "Payments USD"]];
    Array.from(totals.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([key, total]) => {
        rows.push([key, total.toFixed(2)]);
      });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=finance-payments-by-month.csv",
      },
    });
  } catch (err: any) {
    console.error("finance/reports payments-by-month error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
