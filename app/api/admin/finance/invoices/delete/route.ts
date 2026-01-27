import { NextResponse } from "next/server";
import { requireAdmin } from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    return NextResponse.json(
      { ok: false, error: "Financial records cannot be deleted. Use void status instead." },
      { status: 403 }
    );
  } catch (err: any) {
    console.error("finance/invoices delete error:", err);
    return NextResponse.json({ ok: false, error: "Unable to delete invoice." }, { status: 500 });
  }
}
