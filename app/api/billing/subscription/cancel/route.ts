import { NextResponse } from "next/server";
import { cancelTenantSubscription } from "@/lib/billing/stripe-subscription";
import { requireBillingAccess } from "../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireBillingAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const immediate = Boolean(body?.immediate);

    await cancelTenantSubscription({ tenantId: auth.user.tenantId, immediate });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to cancel subscription" }, { status: 500 });
  }
}
