import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';
import { sendPaymentConfirmationEmail } from '@/lib/email/onboarding-emails';
import { sendEmail } from '@/lib/email/email-service';

export const runtime = 'nodejs';

function mapStripeStatusToSubscriptionState(status: string) {
  switch (status) {
    case 'active':
      return 'active';
    case 'past_due':
      return 'grace';
    case 'unpaid':
      return 'soft_locked';
    case 'canceled':
      return 'hard_locked';
    case 'trialing':
      return 'active';
    default:
      return 'grace';
  }
}

function normalizeBillingStatus(status: string): 'active' | 'past_due' | 'canceled' {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'canceled') return 'canceled';
  // past_due, unpaid, incomplete, incomplete_expired, paused -> restrict
  return 'past_due';
}

async function resolveTenantIdFromInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<string> {
  const metadataTenantId = String(invoice.metadata?.tenantId || '').trim();
  if (metadataTenantId) {
    return metadataTenantId;
  }

  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id || '';
  if (!subscriptionId) {
    return '';
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return String(subscription.metadata?.tenantId || '').trim();
  } catch (error) {
    console.error('[STRIPE] Failed to resolve tenantId from invoice subscription', {
      subscriptionId,
      error,
    });
    return '';
  }
}

export async function POST(req: Request) {
  const stripe = getStripeClient();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ ok: false, error: 'Missing Stripe signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Fail closed: never acknowledge (200) when the signature cannot be verified. A 200 here makes
    // Stripe consider the event delivered and stop retrying, silently dropping subscription
    // lifecycle events (upgrade/cancel/past_due). Return 500 so Stripe retries and this alerts.
    console.error('[STRIPE] STRIPE_SUBSCRIPTION_WEBHOOK_SECRET is missing — rejecting webhook');
    return NextResponse.json(
      { ok: false, error: 'Stripe subscription webhook secret is not configured' },
      { status: 500 },
    );
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('[STRIPE] Subscription webhook signature verification failed', error);
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
  }

  const processedRef = adminDb.collection('processed_webhook_events').doc(event.id);
  const processedSnap = await processedRef.get();
  if (processedSnap.exists) {
    return NextResponse.json({ ok: true, received: true });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = String(subscription.metadata?.tenantId || '').trim();
        if (!tenantId) break;

        const updatedPlan = String(subscription.metadata?.bizosto_plan || '').trim();
        await adminDb
          .collection('tenants')
          .doc(tenantId)
          .set(
            {
              subscriptionState: mapStripeStatusToSubscriptionState(subscription.status),
              billingStatus: normalizeBillingStatus(subscription.status),
              currentPeriodEnd: subscription.current_period_end
                ? new Date(subscription.current_period_end * 1000).toISOString()
                : null,
              cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
              stripeSubscriptionId: subscription.id,
              ...(updatedPlan ? { plan: updatedPlan } : {}),
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );

        if (updatedPlan) {
          sendEmail({
            to: 'admin@bizosto.com',
            subject: `📈 Tenant upgraded — ${tenantId} → ${updatedPlan}`,
            html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Platform Alert</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#059669;">📈 Tenant Plan Upgraded</h1>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Tenant</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${tenantId}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">New Plan</td><td style="font-weight:700;color:#059669;text-align:right;border-bottom:1px solid #F1F5F9;">${updatedPlan}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Status</td><td style="font-weight:600;color:#1E293B;text-align:right;">${subscription.status}</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/super_admin/tenants" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View in Super Admin →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto · bizosto.com</p></td></tr>
</table></td></tr></table></body></html>`,
          }).catch((err) => console.error('[STRIPE] Failed to notify super admin of upgrade', err));
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = String(subscription.metadata?.tenantId || '').trim();
        if (!tenantId) break;

        await adminDb.collection('tenants').doc(tenantId).set(
          {
            subscriptionState: 'hard_locked',
            billingStatus: 'canceled',
            plan: 'trial',
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );

        sendEmail({
          to: 'admin@bizosto.com',
          subject: `❌ Tenant cancelled — ${tenantId}`,
          html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Platform Alert</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#DC2626;">❌ Subscription Cancelled</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">A tenant has cancelled their subscription.</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Tenant</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${tenantId}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Status</td><td style="font-weight:600;color:#DC2626;text-align:right;">Cancelled — workspace locked</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/super_admin/tenants" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View in Super Admin →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto · bizosto.com</p></td></tr>
</table></td></tr></table></body></html>`,
        }).catch((err) =>
          console.error('[STRIPE] Failed to notify super admin of cancellation', err),
        );
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const tenantId = await resolveTenantIdFromInvoice(stripe, invoice);
        if (!tenantId) break;

        await adminDb.collection('tenants').doc(tenantId).set(
          {
            subscriptionState: 'active',
            billingStatus: 'active',
            failedPaymentCount: 0,
            lastPaymentAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );

        // Send payment confirmation email to tenant admin
        try {
          const usersSnap = await adminDb
            .collection('users')
            .where('tenantId', '==', tenantId)
            .where('role', '==', 'admin')
            .limit(1)
            .get();

          if (!usersSnap.empty) {
            const adminUser = usersSnap.docs[0].data();
            const email = String(adminUser.email || '').trim();
            const name = String(adminUser.displayName || adminUser.name || 'there').trim();

            if (email) {
              const amountPaid = invoice.amount_paid
                ? new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: String(invoice.currency || 'usd').toUpperCase(),
                  }).format(invoice.amount_paid / 100)
                : '';

              const invoiceUrl = invoice.hosted_invoice_url || null;

              await sendPaymentConfirmationEmail(email, name, tenantId, amountPaid, invoiceUrl);
            }
          }
        } catch (emailErr) {
          console.error('[STRIPE] Failed to send payment confirmation email', emailErr);
        }

        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const tenantId = await resolveTenantIdFromInvoice(stripe, invoice);
        if (!tenantId) break;

        const tenantRef = adminDb.collection('tenants').doc(tenantId);
        let failedCount = 0;
        await adminDb.runTransaction(async (tx) => {
          const snap = await tx.get(tenantRef);
          const currentCount = Number(snap.data()?.failedPaymentCount || 0);
          failedCount = currentCount + 1;

          tx.set(
            tenantRef,
            {
              failedPaymentCount: failedCount,
              subscriptionState: failedCount >= 3 ? 'soft_locked' : 'grace',
              billingStatus: 'past_due',
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        });

        sendEmail({
          to: 'admin@bizosto.com',
          subject: `⚠️ Payment failed — ${tenantId} (attempt ${failedCount})`,
          html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Platform Alert</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#D97706;">⚠️ Payment Failed</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">${failedCount >= 3 ? '🔴 3+ failures — workspace is now soft-locked.' : 'Tenant has been moved to grace period.'}</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Tenant</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${tenantId}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Failed Attempts</td><td style="font-weight:700;color:#DC2626;text-align:right;border-bottom:1px solid #F1F5F9;">${failedCount}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Account Status</td><td style="font-weight:600;color:#D97706;text-align:right;">${failedCount >= 3 ? 'Soft locked' : 'Grace period'}</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/super_admin/payments" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Failed Payments →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto · bizosto.com</p></td></tr>
</table></td></tr></table></body></html>`,
        }).catch((err) =>
          console.error('[STRIPE] Failed to notify super admin of payment failure', err),
        );
        break;
      }
      case 'invoice.finalized': {
        const invoice = event.data.object as Stripe.Invoice;
        const tenantId = await resolveTenantIdFromInvoice(stripe, invoice);
        if (!tenantId) break;

        await adminDb
          .collection('tenants')
          .doc(tenantId)
          .set(
            {
              lastInvoiceTax: Number(invoice.tax || 0) / 100,
              lastInvoiceTotal: Number(invoice.total || 0) / 100,
              lastInvoiceSubtotal: Number(invoice.subtotal || 0) / 100,
              lastInvoiceTaxAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        break;
      }
      case 'customer.tax_id.created': {
        console.info('[TAX] Tax ID created for customer', event.data.object);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error('[STRIPE] Error processing subscription webhook event', {
      type: event.type,
      error,
    });
    // Do NOT mark processed; return non-2xx so Stripe retries.
    return NextResponse.json({ ok: false, error: 'Webhook handler failed' }, { status: 500 });
  }

  await processedRef.set({
    eventId: event.id,
    type: event.type,
    processedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, received: true });
}
