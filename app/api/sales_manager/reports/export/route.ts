import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSalesReportsAccess, toISO } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toCSV(rows: string[][]) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export async function GET() {
  try {
    const auth = await requireSalesReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb.collection("deals").where("isDeleted", "==", false).limit(500).get();
    const rows: string[][] = [["Deal ID", "Deal Name", "Stage", "Owner", "Value USD", "Created At"]];

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      rows.push([
        doc.id,
        String(data.dealName || ""),
        String(data.stage || ""),
        String(data.ownerName || ""),
        String(Number(data.valueUsd || 0)),
        String(toISO(data.createdAt) || ""),
      ]);
    });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=sales-manager-reports.csv",
      },
    });
  } catch (err: any) {
    console.error("sales manager reports export error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
