import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "../../../_utils";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    return NextResponse.json({ ok: true, message: "PDF export is coming soon." });
  } catch (err: any) {
    console.error("super-admin reports/exports finance pdf error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export PDF." }, { status: 500 });
  }
}
