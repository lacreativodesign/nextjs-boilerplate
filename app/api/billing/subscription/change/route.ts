import { NextResponse } from "next/server";
import { normalizePlanKey } from "@/lib/billing/plans";
import { changeTenantPlan } from "@/lib/billing/stripe-subscription";
import { requireBillingAccess } from "../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  try {
    const auth = await requireBillingAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const newPlan = normalizePlanKey(body?.plan);

    await changeTenantPlan({ tenantId: auth.user.tenantId, newPlan });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to change plan" }, { status: 500 });
  }
}
