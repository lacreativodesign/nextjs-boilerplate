import { NextResponse } from "next/server";
import { requireAdmin } from "../../_utils";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    return NextResponse.json({
      ok: true,
      message: "PDF export is coming soon.",
    });
  } catch (err: any) {
    console.error("reports/exports finance pdf error:", err);
    return NextResponse.json({ ok: false, error: "Unable to export PDF." }, { status: 500 });
  }
}
