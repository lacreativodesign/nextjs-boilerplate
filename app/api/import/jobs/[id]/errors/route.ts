import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "@/app/api/admin/_utils";

export const runtime = "nodejs";

function toCsv(errors: Array<Record<string, unknown>>) {
  const header = "row,field,code,message,value";
  const body = errors
    .map((entry) => [entry.row, entry.field || "", entry.code, String(entry.message || "").replace(/,/g, " "), entry.value || ""].join(","))
    .join("\n");
  return `${header}\n${body}`;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const doc = await adminDb.collection("importJobs").doc(params.id).get();
    if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = doc.data() || {};
    if (data.tenantId !== me.tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const errors = Array.isArray(data.errors) ? data.errors : [];
    const download = new URL(request.url).searchParams.get("download") === "csv";

    if (download) {
      return new NextResponse(toCsv(errors), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=import-${params.id}-errors.csv`,
        },
      });
    }

    return NextResponse.json({ id: params.id, errors });
  } catch (error) {
    console.error("Import errors error", error);
    return NextResponse.json({ error: "Failed to fetch errors" }, { status: 500 });
  }
}
