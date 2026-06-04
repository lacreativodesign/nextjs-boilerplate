import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { TeamService } from "@/lib/teams/team-service";
import { getSalesManagerTeamMemberIds, requireSalesReportsAccess, toISO } from "../../_utils";

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

    const memberIds = await getSalesManagerTeamMemberIds(auth.user);
    const baseQuery = adminDb
      .collection("deals")
      .where("tenantId", "==", auth.user.tenantId)
      .where("isDeleted", "==", false)
      .limit(500);

    const docs =
      memberIds === null
        ? (await baseQuery.get()).docs
        : await TeamService.queryWithTeamFilter(baseQuery, "ownerId", memberIds);

    const rows: string[][] = [["Deal ID", "Deal Name", "Stage", "Owner", "Value USD", "Created At"]];

    docs.forEach((doc: any) => {
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
