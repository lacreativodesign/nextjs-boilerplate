import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toCSV(rows: string[][]) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb.collection("projects").where("isDeleted", "==", false).limit(500).get();
    const totals = new Map<string, { name: string; total: number; overdue: number }>();

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const key = String(data.productionUid || data.productionOwnerId || "Unassigned");
      const name = String(data.productionName || data.productionOwnerName || "Unassigned");
      const entry = totals.get(key) || { name, total: 0, overdue: 0 };
      entry.total += 1;
      const dueDate = data.dueDate?.toDate ? data.dueDate.toDate() : data.dueDate;
      if (dueDate && new Date(dueDate).getTime() < Date.now()) {
        entry.overdue += 1;
      }
      totals.set(key, entry);
    });

    const rows = [["Production Owner", "Total Projects", "Overdue Projects"]];
    Array.from(totals.values()).forEach((entry) => {
      rows.push([entry.name, String(entry.total), String(entry.overdue)]);
    });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=reports-production-workload.csv",
      },
    });
  } catch (err: any) {
    console.error("reports/exports production-workload error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
