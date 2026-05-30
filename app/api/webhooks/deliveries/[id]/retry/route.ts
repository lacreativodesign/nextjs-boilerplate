import { NextResponse } from "next/server";
import { retryWebhookDeliveryManually } from "@/lib/webhooks/webhook-delivery";
import { requireWebhookAdmin } from "../../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireWebhookAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const delivery = await retryWebhookDeliveryManually(params.id, auth.user.tenantId as string);
    if (!delivery) return NextResponse.json({ ok: false, error: "Delivery not found." }, { status: 404 });

    return NextResponse.json({ ok: true, delivery });
  } catch (err) {
    console.error("webhooks/deliveries retry error", err);
    return NextResponse.json({ ok: false, error: "Unable to retry delivery." }, { status: 500 });
  }
}
