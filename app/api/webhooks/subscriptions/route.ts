import { NextResponse } from "next/server";
import { createWebhookSubscription, generateWebhookSecret, listWebhookSubscriptions } from "@/lib/webhooks/webhook-delivery";
import { computeWebhookHealth } from "@/lib/webhooks/webhook-delivery";
import { requireWebhookAdmin, webhookSubscriptionSchema } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireWebhookAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const subscriptions = await listWebhookSubscriptions(auth.user.tenantId);
    return NextResponse.json({ ok: true, subscriptions, health: computeWebhookHealth(subscriptions) });
  } catch (err) {
    console.error("webhooks/subscriptions get error", err);
    return NextResponse.json({ ok: false, error: "Unable to load webhook subscriptions." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireWebhookAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const parsed = webhookSubscriptionSchema.safeParse({
      ...body,
      secret: body?.secret || generateWebhookSecret(),
    });

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid payload." }, { status: 400 });
    }

    const subscription = await createWebhookSubscription({
      tenantId: auth.user.tenantId,
      actorUid: auth.user.uid,
      ...parsed.data,
    });

    return NextResponse.json({ ok: true, subscription }, { status: 201 });
  } catch (err) {
    console.error("webhooks/subscriptions create error", err);
    return NextResponse.json({ ok: false, error: "Unable to create webhook subscription." }, { status: 500 });
  }
}
