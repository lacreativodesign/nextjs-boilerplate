import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "@/app/api/admin/_utils";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const doc = await adminDb.collection("importJobs").doc(params.id).get();
    if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = doc.data() || {};
    if (data.tenantId !== me.tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    return NextResponse.json({
      id: doc.id,
      status: data.status,
      progress: data.progress,
      processedRows: data.processedRows,
      totalRows: data.totalRows,
      summary: data.summary || null,
      updatedAt: data.updatedAt,
    });
  } catch (error) {
    console.error("Import status error", error);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
