import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import { getEnvelopeStatus } from "@/lib/integrations/docusign";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: { envelopeId: string } }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const envelopeId = String(context.params?.envelopeId || "").trim();
    if (!envelopeId) return NextResponse.json({ ok: false, error: "envelopeId is required." }, { status: 400 });

    const envelope = await getEnvelopeStatus(auth.user.tenantId as string, envelopeId);
    return NextResponse.json({ ok: true, envelope });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to fetch envelope status." }, { status: 500 });
  }
}
