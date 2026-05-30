import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { canAccessReport, getCustomReportOrThrow, requireReportsUser } from "../../_utils";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, tenantId } = await requireReportsUser(request);
    const report = await getCustomReportOrThrow(tenantId, params.id);
    if (!canAccessReport(report, user.uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snapshots = await adminDb
      .collection("report_snapshots")
      .where("tenantId", "==", tenantId)
      .where("reportId", "==", params.id)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    return NextResponse.json({
      snapshots: snapshots.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() })),
    });
  } catch (error) {
    const message = (error instanceof Error ? error.message : undefined) || "Failed to fetch cached results";
    const status = message === "Report not found" ? 404 : message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
