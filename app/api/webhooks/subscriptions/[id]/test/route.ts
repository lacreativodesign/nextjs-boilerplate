import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { dispatchWebhookEvent } from "@/lib/webhooks/webhook-delivery";
import { requireWebhookAdmin } from "../../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireWebhookAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const subscriptionSnap = await adminDb.collection("webhook_subscriptions").doc(params.id).get();
    if (!subscriptionSnap.exists) return NextResponse.json({ ok: false, error: "Subscription not found." }, { status: 404 });

    const data = subscriptionSnap.data() || {};
    if (data.tenantId !== auth.user.tenantId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const firstEvent = Array.isArray(data.events) && data.events.length > 0 ? data.events[0] : "invoice.created";
    const result = await dispatchWebhookEvent({
      tenantId: auth.user.tenantId,
      event: firstEvent,
      entityType: "webhook",
      entityId: params.id,
      payload: {
        test: true,
        message: "Bizosto webhook test event",
        subscriptionId: params.id,
      },
      actor: {
        uid: auth.user.uid,
        email: auth.user.email || null,
        role: auth.user.role || null,
      },
      source: "system",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("webhooks/subscriptions test error", err);
    return NextResponse.json({ ok: false, error: "Unable to send test webhook event." }, { status: 500 });
  }
}
