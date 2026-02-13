import { NextResponse } from "next/server";
import { requireBillingAccess } from "../_utils";
import { getCurrentSubscription } from "@/lib/billing/stripe-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireBillingAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const subscription = await getCurrentSubscription(auth.user.tenantId);
    return NextResponse.json({ ok: true, subscription });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to load subscription" }, { status: 500 });
  }
}
