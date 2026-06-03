import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";
import { parseNumber, parseString, requireSalesWrite, serverTimestamp, userLabel } from "../../_utils";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStripeConfig(tenantId: string) {
  const snap = await adminDb.collection("tenants").doc(tenantId).collection("integrations").doc("stripe").get();
  if (!snap.exists) return null;
  return snap.data() || null;
}

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const leadId = parseString(body.leadId, "");
    const amountUsd = parseNumber(body.amountUsd, 0);
    const description = parseString(body.description, "").trim();

    if (!leadId) {
      return NextResponse.json({ ok: false, error: "Lead is required." }, { status: 400 });
    }
    if (amountUsd <= 0) {
      return NextResponse.json({ ok: false, error: "Amount must be greater than 0." }, { status: 400 });
    }

    const tenantId = auth.user.tenantId || "";
    const leadSnap = await adminDb.collection("leads").doc(leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }
    const lead = leadSnap.data() || {};
    if (lead.tenantId && lead.tenantId !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (auth.user.role === "sales" && lead.ownerId !== auth.user.uid) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const stripeConfig = await getStripeConfig(tenantId);
    if (!stripeConfig?.enabled || !stripeConfig?.secretKey) {
      return NextResponse.json({ ok: false, error: "Stripe is not configured for this tenant." }, { status: 400 });
    }

    const stripe = new Stripe(String(stripeConfig.secretKey), { apiVersion: "2024-04-10" });
    const origin = new URL(req.url).origin;
    const successUrl = `${origin}/sales/leads?payment=success`;
    const cancelUrl = `${origin}/sales/leads?payment=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: lead.contactEmail || lead.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amountUsd * 100),
            product_data: {
              name: description || `Payment for ${lead.companyName || lead.contactName || "Lead"}`,
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    const requestRef = adminDb.collection("paymentRequests").doc();
    await requestRef.set({
      id: requestRef.id,
      tenantId,
      leadId,
      clientId: lead.clientId || null,
      amountUsd,
      currency: "USD",
      status: "sent",
      paymentProvider: "stripe",
      stripeCheckoutSessionId: session.id,
      checkoutUrl: session.url || null,
      description: description || null,
      createdByUserId: auth.user.uid,
      createdByRole: auth.user.role || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const salesName = userLabel(auth.user);
    const [adminIds, financeIds] = await Promise.all([
      getUserIdsByRoles(["admin", "super_admin"], tenantId),
      getUserIdsByRoles(["finance"], tenantId),
    ]);
    await Promise.all(
      [...adminIds, ...financeIds].map((uid) =>
        createNotification({
          toUserId: uid,
          title: "Payment link sent",
          body: `Payment link sent by ${salesName} — $${amountUsd.toLocaleString()}`,
          type: "info",
          entityType: "invoice",
          entityId: requestRef.id,
          deepLink: adminIds.includes(uid) ? "/admin/finance/invoices" : "/finance/invoices",
          createdBy: { uid: auth.user.uid, name: salesName },
        })
      )
    );

    return NextResponse.json({ ok: true, id: requestRef.id, checkoutUrl: session.url });
  } catch (err) {
    console.error("sales payment link error:", err);
    return NextResponse.json({ ok: false, error: "Unable to create payment link." }, { status: 500 });
  }
}
