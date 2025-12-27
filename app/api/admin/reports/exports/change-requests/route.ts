import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, toISO } from "../../_utils";

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

    const [snap, altSnap] = await Promise.all([
      adminDb.collection("changeRequests").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("change_requests").where("isDeleted", "==", false).limit(500).get(),
    ]);

    const rows = [["Change Request", "Client", "Status", "Created At"]];
    [...snap.docs, ...altSnap.docs].forEach((doc) => {
      const data = doc.data() || {};
      rows.push([
        String(data.title || data.name || doc.id),
        String(data.clientName || "Unknown"),
        String(data.status || "Open"),
        toISO(data.createdAt) || "",
      ]);
    });

    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=reports-change-requests.csv",
      },
    });
  } catch (err: any) {
    console.error("reports/exports change-requests error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export report." }, { status: 500 });
  }
}
