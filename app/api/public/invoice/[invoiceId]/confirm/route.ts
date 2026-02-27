import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getStripeClient } from "@/lib/payments/stripe";
import { getInvoiceWithValidation, getTenantRecord } from "../../shared";

export const runtime = "nodejs";

type Body = { paymentIntentId?: string };

export async function POST(req: Request, { params }: { params: { invoiceId: string } }) {
  try {
    const invoiceId = String(params.invoiceId || "").trim();
    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: "Invoice id is required." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const paymentIntentId = String(body.paymentIntentId || "").trim();
    if (!paymentIntentId) {
      return NextResponse.json({ ok: false, error: "paymentIntentId is required." }, { status: 400 });
    }

    const validation = await getInvoiceWithValidation(invoiceId);
    if ("error" in validation) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: validation.status });
    }

    if (String(validation.payload.status).toLowerCase() === "paid") {
      return NextResponse.json({ ok: false, error: "This invoice has already been paid" }, { status: 400 });
    }

    const tenant = await getTenantRecord(validation.payload.tenantId);
    const connectAccountId = String(tenant?.stripeConnectAccountId || "").trim();
    if (!tenant || !connectAccountId || tenant.stripeConnectChargesEnabled !== true) {
      return NextResponse.json({ ok: false, error: "Online payments are not enabled for this invoice." }, { status: 400 });
    }

    const stripe = getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { stripeAccount: connectAccountId });

    if (paymentIntent.status === "succeeded") {
      const nowIso = new Date().toISOString();
      await adminDb.collection("invoices").doc(invoiceId).update({
        status: "paid",
        paidAt: nowIso,
        paidAmount: validation.payload.amount,
        paymentMethod: "stripe",
        stripePaymentIntentId: paymentIntent.id,
        updatedAt: nowIso,
      });

      return NextResponse.json({ ok: true, status: "succeeded" });
    }

    if (paymentIntent.status === "requires_action") {
      return NextResponse.json({ ok: true, status: "requires_action", clientSecret: paymentIntent.client_secret });
    }

    return NextResponse.json(
      { ok: false, status: paymentIntent.status, error: "Payment could not be confirmed" },
      { status: 400 }
    );
  } catch (err) {
    console.error("public invoice confirm error:", err);
    return NextResponse.json({ ok: false, error: "Unable to confirm payment." }, { status: 500 });
  }
}
