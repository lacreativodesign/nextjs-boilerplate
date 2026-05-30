import { NextResponse } from "next/server";
import { updatePaymentMethod } from "@/lib/billing/stripe-subscription";
import { requireBillingAccess } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireBillingAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const paymentMethodId = String(body?.paymentMethodId || "").trim();
    if (!paymentMethodId) {
      return NextResponse.json({ ok: false, error: "paymentMethodId is required" }, { status: 400 });
    }

    await updatePaymentMethod({ tenantId: auth.user.tenantId, paymentMethodId }) as string;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to update payment method" }, { status: 500 });
  }
}
