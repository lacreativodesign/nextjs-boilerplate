import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { adminDb } from "@/lib/firebaseAdmin";
import { getVariablesForCategory } from "@/lib/email/template-catalog";
import { normalizeTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const snap = await adminDb.collection("email_templates").doc(params.id).get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });

    const data = snap.data() || {};
    const tenantId = normalizeTenantId(me.tenantId || null);
    if (normalizeTenantId(data.tenantId) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const categoryVariables = getVariablesForCategory(data.category);
    const variables = Array.from(new Set([...(data.variables || []), ...categoryVariables])).sort();

    return NextResponse.json({ ok: true, variables, category: data.category });
  } catch (error) {
    console.error("GET /api/email/templates/[id]/variables error", error);
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Failed to list variables" }, { status: 500 });
  }
}
