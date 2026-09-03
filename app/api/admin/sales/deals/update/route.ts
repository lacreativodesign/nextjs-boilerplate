import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  arrayUnion,
  createSalesEvent,
  parseNumber,
  parseString,
  queueSalesEmail,
  queueSalesNotification,
  requireAdmin,
  serverTimestamp,
} from '../../_utils';
import { generateInvoiceToken } from '@/lib/finance/invoiceToken';
import { validateRequest } from '@/lib/validations/validate';
import { dealCommercialUpdateSchema } from '@/lib/validations/commercial-activation';
import { resolveErrorResponse } from '@/lib/errors';
import { resolveInvoicePaymentSchedule } from '@/lib/finance/paymentSchedule';
import { enqueueTenantEmail } from '@/lib/email/outbox';
import { invoicePaymentUrl } from '@/lib/urls';
import { docTenantId, normalizeTenantId } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = validateRequest(dealCommercialUpdateSchema, await req.json());
    const id = payload.id;
    const dealRef = adminDb.collection('deals').doc(id);
    const preSnap = await dealRef.get();
    if (!preSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    const preData = preSnap.data() || {};
    const isSuperAdmin = (auth.user.role || '').toLowerCase() === 'super_admin';
    const authTenantId = normalizeTenantId(auth.user.tenantId);
    if (!isSuperAdmin && docTenantId(preData) !== authTenantId) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    let closedWonTriggered = false;
    let closedWonInvoiceId = '';
    let closedWonClientId = '';
    let closedWonPaymentToken = '';
    let closedWonOrderId = '';
    let closedWonPayableNow = 0;
    let closedWonAmountTotal = 0;
    let closedWonPaymentPlan: 'full' | 'fifty_fifty' = 'full';
    let closedWonTenantId = authTenantId;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(dealRef);
      if (!snap.exists) {
        throw new Error('Deal not found');
      }
      const data = snap.data() || {};
      const tenantId = normalizeTenantId(data.tenantId || auth.user.tenantId);
      if (!isSuperAdmin && tenantId !== authTenantId) {
        throw new Error('Deal tenant mismatch');
      }
      closedWonTenantId = tenantId;

      const prevStage = parseString(data.stage, 'New Lead');
      const nextStage = payload.stage !== undefined ? payload.stage : prevStage;
      const updates: Record<string, any> = {
        tenantId,
        updatedAt: serverTimestamp(),
      };

      if (payload.dealName !== undefined) updates.dealName = payload.dealName;
      if (payload.clientName !== undefined) updates.clientName = payload.clientName;
      if (payload.valueUsd !== undefined) updates.valueUsd = payload.valueUsd;
      if (payload.probability !== undefined) updates.probability = payload.probability;
      if (payload.ownerId !== undefined) updates.ownerId = payload.ownerId || null;
      if (payload.ownerName !== undefined) updates.ownerName = payload.ownerName || null;
      if (payload.expectedCloseDate !== undefined) {
        updates.expectedCloseDate = payload.expectedCloseDate
          ? new Date(payload.expectedCloseDate)
          : null;
      }
      if (payload.paymentPlan !== undefined) updates.paymentPlan = payload.paymentPlan;
      if (payload.balanceTriggerType !== undefined)
        updates.balanceTriggerType = payload.balanceTriggerType;
      if (payload.balanceDueDate !== undefined)
        updates.balanceDueDate = payload.balanceDueDate ? new Date(payload.balanceDueDate) : null;
      if (payload.balanceMilestoneStage !== undefined)
        updates.balanceMilestoneStage = payload.balanceMilestoneStage;

      if (nextStage !== prevStage) {
        updates.stage = nextStage;
        updates.stageHistory = arrayUnion({
          from: prevStage,
          to: nextStage,
          changedAt: serverTimestamp(),
          changedByUid: auth.user.uid,
          changedByName: auth.user.name || auth.user.fullName || '',
        });
      }

      const shouldProcessClosedWon = nextStage === 'Closed Won' && !data.closedWonProcessed;
      if (shouldProcessClosedWon) {
        closedWonTriggered = true;
        const clientName =
          parseString(payload.clientName, '') ||
          parseString(data.clientName, '') ||
          parseString(data.leadName, '') ||
          'New Client';
        const clientEmail = parseString(
          data.clientEmail || data.leadEmail || data.email || data.primaryContactEmail,
          '',
        )
          .trim()
          .toLowerCase();

        let clientId = String(data.clientId || '').trim();
        let clientRef = clientId ? adminDb.collection('clients').doc(clientId) : null;
        if (clientRef) {
          const clientSnap = await tx.get(clientRef);
          if (!clientSnap.exists || docTenantId(clientSnap.data()) !== tenantId) {
            throw new Error('Deal client does not belong to this tenant.');
          }
        } else {
          clientRef = adminDb.collection('clients').doc();
          clientId = clientRef.id;
          tx.set(clientRef, {
            tenantId,
            companyName: clientName,
            primaryContactEmail: clientEmail || null,
            ownerAmUid: updates.ownerId || data.ownerId || null,
            ownerAmName: updates.ownerName || data.ownerName || null,
            accountStatus: 'PENDING_PAYMENT',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isDeleted: false,
          });
        }

        const amountTotal = parseNumber(payload.valueUsd, Number(data.valueUsd || 0));
        if (!Number.isFinite(amountTotal) || amountTotal <= 0) {
          throw new Error('A positive deal value is required before closing won.');
        }

        const paymentPlan = payload.paymentPlan || data.paymentPlan || 'full';
        const balanceTriggerType =
          paymentPlan === 'fifty_fifty'
            ? payload.balanceTriggerType || data.balanceTriggerType || null
            : null;
        const balanceDueDate =
          paymentPlan === 'fifty_fifty' && balanceTriggerType === 'date'
            ? payload.balanceDueDate || data.balanceDueDate || null
            : null;
        const balanceMilestoneStage =
          paymentPlan === 'fifty_fifty' && balanceTriggerType === 'milestone'
            ? payload.balanceMilestoneStage || data.balanceMilestoneStage || null
            : null;

        if (paymentPlan === 'fifty_fifty' && !balanceTriggerType) {
          throw new Error('50/50 payment terms require a balance due date or project milestone.');
        }
        if (paymentPlan === 'fifty_fifty' && balanceTriggerType === 'date' && !balanceDueDate) {
          throw new Error('50/50 date-based terms require a balance due date.');
        }
        if (
          paymentPlan === 'fifty_fifty' &&
          balanceTriggerType === 'milestone' &&
          !balanceMilestoneStage
        ) {
          throw new Error('50/50 milestone terms require a project milestone.');
        }

        const schedule = resolveInvoicePaymentSchedule({
          amountTotalUsd: amountTotal,
          paymentPlan,
          totalPaid: 0,
        });
        const orderId = String(data.orderId || `DEAL-${id}`);
        let invoiceId = String(data.invoiceId || '').trim();
        let paymentToken = '';

        if (invoiceId) {
          const invoiceRef = adminDb.collection('invoices').doc(invoiceId);
          const invoiceSnap = await tx.get(invoiceRef);
          if (!invoiceSnap.exists || docTenantId(invoiceSnap.data()) !== tenantId) {
            throw new Error('Deal invoice does not belong to this tenant.');
          }
          paymentToken = String(invoiceSnap.data()?.paymentToken || '');
        } else {
          const invoiceRef = adminDb.collection('invoices').doc();
          invoiceId = invoiceRef.id;
          paymentToken = generateInvoiceToken();
          tx.set(invoiceRef, {
            tenantId,
            type: 'service',
            engagementId: id,
            dealId: id,
            orderId,
            clientId,
            clientName,
            paymentToken,
            currency: 'USD',
            amountSubtotalUsd: amountTotal,
            amountTotal: amountTotal,
            amountTotalUsd: amountTotal,
            amountTaxUsd: 0,
            status: 'issued',
            paymentPlan,
            firstInstallmentAmountUsd: schedule.firstInstallmentAmount,
            secondInstallmentAmountUsd: schedule.secondInstallmentAmount,
            totalPaid: 0,
            paidAmount: 0,
            balanceDue: amountTotal,
            balanceTriggerType,
            balanceDueDate: balanceDueDate ? new Date(String(balanceDueDate)) : null,
            balanceMilestoneStage,
            // The existing reminder engine chases issued/partially_paid invoices by dueDate.
            // A milestone-based balance gets its dueDate when the milestone is reached.
            dueDate:
              paymentPlan === 'fifty_fifty' && balanceTriggerType === 'date' && balanceDueDate
                ? new Date(String(balanceDueDate))
                : null,
            issuedAt: serverTimestamp(),
            notes:
              paymentPlan === 'fifty_fifty'
                ? 'Auto-generated from Closed Won deal. Project begins after the 50% deposit.'
                : 'Auto-generated from Closed Won deal. Project begins after payment.',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isDeleted: false,
          });
        }

        updates.clientId = clientId;
        updates.engagementId = id;
        updates.orderId = orderId;
        updates.invoiceId = invoiceId;
        updates.paymentPlan = paymentPlan;
        updates.balanceTriggerType = balanceTriggerType;
        updates.balanceDueDate = balanceDueDate ? new Date(String(balanceDueDate)) : null;
        updates.balanceMilestoneStage = balanceMilestoneStage;
        updates.paymentStatus = 'issued';
        updates.engagementStatus = 'awaiting_payment';
        updates.closedWonProcessed = true;
        updates.closedWonAt = serverTimestamp();

        closedWonInvoiceId = invoiceId;
        closedWonClientId = clientId;
        closedWonPaymentToken = paymentToken;
        closedWonOrderId = orderId;
        closedWonPayableNow = schedule.payableNow;
        closedWonAmountTotal = amountTotal;
        closedWonPaymentPlan = paymentPlan;
      }

      tx.set(dealRef, updates, { merge: true });
    });

    await createSalesEvent({
      type: closedWonTriggered ? 'deal_closed_won' : 'deal_updated',
      title: closedWonTriggered ? 'Deal closed won' : 'Deal updated',
      description: closedWonTriggered
        ? `Deal ${id} marked Closed Won; payment request prepared.`
        : `Deal ${id} updated`,
      entityType: 'deal',
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || '',
      tenantId: closedWonTenantId,
    });

    if (closedWonTriggered) {
      await queueSalesNotification({
        title: 'Deal Closed Won',
        body: `Deal ${id} closed won. Invoice prepared; production starts on the first successful payment.`,
        userId: auth.user.uid,
        metadata: { dealId: id, invoiceId: closedWonInvoiceId },
        tenantId: closedWonTenantId,
      });

      await queueSalesEmail({
        to: auth.user.email || '',
        template: 'deal_closed_won',
        subject: 'Deal Closed Won',
        data: { dealId: id, invoiceId: closedWonInvoiceId },
        tenantId: closedWonTenantId,
      });

      const [clientSnap, tenantSnap] = await Promise.all([
        adminDb.collection('clients').doc(closedWonClientId).get(),
        adminDb.collection('tenants').doc(closedWonTenantId).get(),
      ]);
      const client = clientSnap.data() || {};
      const tenant = tenantSnap.data() || {};
      const clientEmail = String(client.primaryContactEmail || '').trim();
      if (clientEmail) {
        const tenantName = String(tenant?.brand?.name || tenant.name || 'Your service provider');
        const payUrl = invoicePaymentUrl(closedWonInvoiceId, closedWonPaymentToken);
        const paymentLabel =
          closedWonPaymentPlan === 'fifty_fifty'
            ? `50% deposit (${closedWonPayableNow.toFixed(2)} USD)`
            : `${closedWonPayableNow.toFixed(2)} USD`;

        await enqueueTenantEmail({
          tenantId: closedWonTenantId,
          tenant,
          messageClass: 'invoice.closed_won_payment_request',
          entityId: closedWonInvoiceId,
          to: clientEmail,
          subject: `Payment request — ${closedWonOrderId}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;line-height:1.6">
            <h2 style="margin-bottom:8px">Your project is ready to start</h2>
            <p>${escapeHtml(tenantName)} has prepared invoice <strong>${escapeHtml(closedWonOrderId)}</strong>.</p>
            <p>Total project value: <strong>${closedWonAmountTotal.toFixed(2)} USD</strong><br/>Amount due now: <strong>${paymentLabel}</strong></p>
            <p>Production will begin automatically as soon as this payment is confirmed.</p>
            <p style="margin:24px 0"><a href="${payUrl}" style="display:inline-block;padding:12px 20px;background:#012167;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">View invoice &amp; pay securely</a></p>
            <p style="font-size:12px;color:#6B7280">Payments are processed securely through the payment system provided by ${escapeHtml(tenantName)}.</p>
          </div>`,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      ...(closedWonTriggered
        ? {
            commercialActivation: {
              invoiceId: closedWonInvoiceId,
              orderId: closedWonOrderId,
              paymentPlan: closedWonPaymentPlan,
              amountTotal: closedWonAmountTotal,
              amountDueNow: closedWonPayableNow,
              projectCreated: false,
              status: 'awaiting_payment',
            },
          }
        : {}),
    });
  } catch (err: unknown) {
    console.error('sales deals update error:', err);
    const resolved = resolveErrorResponse(err, {
      fallbackMessage: err instanceof Error ? err.message : 'Unable to update deal.',
      exposeMessage: true,
    });
    return NextResponse.json(resolved.body, { status: resolved.status, headers: resolved.headers });
  }
}
