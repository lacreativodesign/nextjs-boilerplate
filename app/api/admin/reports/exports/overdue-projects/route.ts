import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeStage, requireReportsAccess, toISO } from "../../_utils";

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

    const snap = await adminDb.collection("projects").where("isDeleted", "==", false).limit(500).get();
    const rows = [["Project", "Client", "Stage", "Due Date", "Owner", "Production Owner"]];

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const stage = normalizeStage(data.stage);
      if (stage === "Delivered") return;
      const dueDate = toISO(data.dueDate);
      if (!dueDate) return;
      const dueMs = new Date(dueDate).getTime();
      if (Number.isNaN(dueMs) || dueMs >= Date.now()) return;
      rows.push([
        String(data.projectName || doc.id),
        String(data.clientName || "Unknown"),
        stage,
        dueDate,
        String(data.ownerAmName || data.ownerName || ""),
        String(data.productionName || data.productionOwnerName || ""),
      ]);
    });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=reports-overdue-projects.csv",
      },
    });
  } catch (err: any) {
    console.error("reports/exports overdue-projects error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
