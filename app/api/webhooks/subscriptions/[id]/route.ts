import { NextResponse } from "next/server";
import { deleteWebhookSubscription, updateWebhookSubscription } from "@/lib/webhooks/webhook-delivery";
import { requireWebhookAdmin, webhookSubscriptionSchema } from "../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireWebhookAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const parsed = webhookSubscriptionSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid payload." }, { status: 400 });
    }

    const subscription = await updateWebhookSubscription(params.id, auth.user.tenantId as string, {
      ...parsed.data,
      actorUid: auth.user.uid,
    });

    if (!subscription) return NextResponse.json({ ok: false, error: "Subscription not found." }, { status: 404 });
    return NextResponse.json({ ok: true, subscription });
  } catch (err) {
    console.error("webhooks/subscriptions update error", err);
    return NextResponse.json({ ok: false, error: "Unable to update webhook subscription." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireWebhookAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const deleted = await deleteWebhookSubscription(params.id, auth.user.tenantId as string);
    if (!deleted) return NextResponse.json({ ok: false, error: "Subscription not found." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("webhooks/subscriptions delete error", err);
    return NextResponse.json({ ok: false, error: "Unable to delete webhook subscription." }, { status: 500 });
  }
}
