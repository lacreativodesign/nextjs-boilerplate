import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireReportsAccess } from "../../_utils";
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
    const format = searchParams.get("format") || "csv";

    const snap = await adminDb.collection("projects").where("tenantId", "==", auth.user.tenantId).where("isDeleted", "==", false).limit(500).get();
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

    if (format === "xlsx") {
      const buffer = toExcel(rows, "Production Workload");
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=reports-production-workload.xlsx",
        },
      });
    } else if (format === "pdf") {
      const buffer = await toPDF(rows, "Production Workload");
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename=reports-production-workload.pdf",
        },
      });
    } else {
      const csv = toCSV(rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=reports-production-workload.csv",
        },
      });
    }
  } catch (err: any) {
    console.error("reports/exports production-workload error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
