import { NextResponse } from "next/server";
import { handleBillingWebhook, verifyAndConstructBillingEvent } from "@/lib/billing/stripe-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ ok: false, error: "Missing stripe-signature header" }, { status: 400 });
    }

    const rawBody = await req.text();
    const event = await verifyAndConstructBillingEvent(rawBody, signature);
    await handleBillingWebhook(event);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Webhook handling failed" }, { status: 400 });
  }
}
