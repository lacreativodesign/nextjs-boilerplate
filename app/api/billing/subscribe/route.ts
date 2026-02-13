import { NextResponse } from "next/server";
import { normalizePlanKey } from "@/lib/billing/plans";
import { requireBillingAccess } from "../_utils";
import { subscribeTenantToPlan } from "@/lib/billing/stripe-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireBillingAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const plan = normalizePlanKey(body?.plan);
    const paymentMethodId = String(body?.paymentMethodId || "").trim() || undefined;

    const subscription = await subscribeTenantToPlan({
      tenantId: auth.user.tenantId,
      plan,
      paymentMethodId,
      email: String(auth.user.email || "").trim() || undefined,
      name: String(auth.user.displayName || "").trim() || undefined,
    });

    return NextResponse.json({ ok: true, subscription });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to subscribe" }, { status: 500 });
  }
}
