import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, toISO } from "../../_utils";
import { normalizePaymentStatus } from "@/lib/finance/status";
import { normalizeTenantId } from "@/lib/tenant";
import { queryWithTenant } from "@/lib/tenant/query";

export const dynamic = "force-dynamic";

function toCSV(rows: string[][]) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function toMonthKey(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId as string | null | undefined);
    const docs = await queryWithTenant(
      adminDb.collection("payments").where("isDeleted", "==", false).limit(500),
      tenantId
    );
    const totals = new Map<string, number>();

    docs.forEach((doc) => {
      const data = doc.data() || {};
      if (normalizePaymentStatus(data.status) !== "succeeded") return;
      const month = toMonthKey(toISO(data.paidAt) || toISO(data.createdAt));
      if (!month) return;
      totals.set(month, (totals.get(month) || 0) + Number(data.amountUsd || 0));
    });

    const rows = [["Month", "Payments USD"]];
    Array.from(totals.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([month, total]) => {
        rows.push([month, total.toFixed(2)]);
      });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=finance-payments-by-month.csv",
      },
    });
  } catch (err) {
    console.error("finance/reports payments-by-month error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
