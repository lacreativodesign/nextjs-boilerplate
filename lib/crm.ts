import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { logEvent } from '@/lib/audit';
import { queueClientActivationInvite } from '@/lib/clientActivation';
import { DEFAULT_TENANT_ID, normalizeTenantId } from '@/lib/tenant';
import { getCurrentUser, normalizeRole } from '@/app/api/admin/_utils';
import { checkModuleAccess } from '@/app/lib/plan-enforcement';
import { generateInvoiceToken } from '@/lib/finance/invoiceToken';

export const DEAL_STAGES = [
  'new',
  'contacted',
  'qualified',
  'proposal_sent',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const LEAD_STATUSES = ['new', 'qualified', 'converted'] as const;

export function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function isCrmRole(role?: string | null) {
  const normalized = normalizeRole(role || '');
  return normalized === 'sales' || normalized === 'sales_manager' || normalized === 'admin';
}

export function canCreateLeads(role?: string | null) {
  return normalizeRole(role || '') === 'sales';
}

export function canApproveDiscount(role?: string | null) {
  return normalizeRole(role || '') === 'sales_manager';
}

export function canManageOwnDeals(role?: string | null) {
  return normalizeRole(role || '') === 'sales';
}

export function isAdminReadOnly(role?: string | null) {
  return normalizeRole(role || '') === 'admin';
}

export async function requireCrmUser() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }
  if (!isCrmRole(me.role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  const tenantId = normalizeTenantId(me.tenantId || DEFAULT_TENANT_ID);
  // P-1: enforce the plan on the API, not just in the UI. `crm` is enabled on every
  // current tier, so this is a no-op today — but it is the layer that keeps the
  // guarantee true if a tier changes or an operator disables the module on a tenant.
  const planAccess = await checkModuleAccess(tenantId, 'crm', me.role);
  if (!planAccess.ok) {
    return { ok: false as const, status: planAccess.status, error: planAccess.error };
  }
  return {
    ok: true as const,
    user: me,
    tenantId,
  };
}

export function stageIndex(stage?: string | null) {
  return DEAL_STAGES.indexOf((stage || 'new') as DealStage);
}

export function canMoveStage(fromStage?: string | null, toStage?: string | null) {
  const fromIndex = stageIndex(fromStage);
  const toIndex = stageIndex(toStage);
  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex <= fromIndex + 1;
}

export async function createClientFromClosedWonDeal({
  dealId,
  actor,
}: {
  dealId: string;
  actor: { uid: string; name?: string | null; tenantId?: string | null };
}) {
  const dealRef = adminDb.collection('deals').doc(dealId);
  const actorTenantId = String(actor.tenantId || '').trim();
  if (!actorTenantId) {
    throw new Error('Tenant context is required for closed-won activation.');
  }

  const result = await adminDb.runTransaction(async (tx) => {
    const dealSnap = await tx.get(dealRef);
    if (!dealSnap.exists) {
      throw new Error('Deal not found');
    }

    const deal = dealSnap.data() || {};
    const dealTenantId = String(deal.tenantId || '').trim();
    if (!dealTenantId || dealTenantId !== actorTenantId) {
      throw new Error('Forbidden');
    }
    const normalizedStage = String(deal.stage || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (normalizedStage !== 'closed_won' && String(deal.status || '').toLowerCase() !== 'won') {
      throw new Error('Deal is not Closed Won.');
    }
    const discountPct = Number(deal.discountPct || 0);
    const discountStatus = String(deal.discountStatus || '').toLowerCase();
    if (
      discountPct > 20 &&
      deal.discountApproved !== true &&
      !['approved', 'auto_approved'].includes(discountStatus)
    ) {
      throw new Error('Discount approval is required before Closed Won activation.');
    }

    const leadId = String(deal.leadId || '');
    const leadRef = leadId ? adminDb.collection('leads').doc(leadId) : null;
    const leadSnap = leadRef ? await tx.get(leadRef) : null;
    const lead = leadSnap?.data() || {};
    if (leadSnap?.exists && String(lead.tenantId || '') !== dealTenantId) {
      throw new Error('Deal lead tenant binding is invalid.');
    }

    const tenantRef = adminDb.collection('tenants').doc(dealTenantId);
    const tenantSnap = await tx.get(tenantRef);
    if (!tenantSnap.exists) {
      throw new Error('Tenant not found.');
    }

    const existingClientId = String(deal.clientId || '').trim();
    const existingProjectId = String(deal.projectId || '').trim();
    const existingInvoiceId = String(deal.invoiceId || '').trim();
    const clientRef = existingClientId
      ? adminDb.collection('clients').doc(existingClientId)
      : adminDb.collection('clients').doc();
    const projectRef = existingProjectId
      ? adminDb.collection('projects').doc(existingProjectId)
      : adminDb.collection('projects').doc();
    const invoiceRef = existingInvoiceId
      ? adminDb.collection('invoices').doc(existingInvoiceId)
      : adminDb.collection('invoices').doc();

    const [clientSnap, projectSnap, invoiceSnap] = await Promise.all([
      existingClientId ? tx.get(clientRef) : Promise.resolve(null),
      existingProjectId ? tx.get(projectRef) : Promise.resolve(null),
      existingInvoiceId ? tx.get(invoiceRef) : Promise.resolve(null),
    ]);
    for (const existing of [clientSnap, projectSnap, invoiceSnap]) {
      if (
        existing &&
        (!existing.exists || String(existing.data()?.tenantId || '') !== dealTenantId)
      ) {
        throw new Error('Closed-won artifact tenant binding is invalid.');
      }
    }

    const companyName =
      String(lead.company || '').trim() ||
      String(deal.clientName || '').trim() ||
      String(deal.dealName || deal.title || '').trim() ||
      'Client';
    const contactName =
      String(lead.name || '').trim() || String(deal.leadName || deal.contactName || '').trim();
    const contactEmail =
      String(lead.email || '')
        .trim()
        .toLowerCase() ||
      String(deal.leadEmail || deal.contactEmail || '')
        .trim()
        .toLowerCase();
    const amount = Number(deal.finalPriceUsd ?? deal.valueUsd ?? deal.amountUsd ?? 0);
    const tenant = tenantSnap.data() || {};
    const currency = String(tenant.operatingCurrency || tenant.currency || 'USD').toUpperCase();

    if (!existingClientId) {
      tx.set(clientRef, {
        companyName,
        primaryContactName: contactName || null,
        primaryContactEmail: contactEmail || null,
        primaryContactEmailLower: contactEmail || null,
        phone: String(lead.phone || deal.leadPhone || '').trim() || null,
        source: String(lead.source || 'sales_closed_won').trim(),
        salesStage: 'Closed Won',
        paymentStatus: 'Unpaid',
        tenantId: dealTenantId,
        crmDealId: dealId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isDeleted: false,
      });
    }

    if (!existingProjectId) {
      tx.set(projectRef, {
        projectName: String(deal.dealName || deal.title || `${companyName} project`).trim(),
        clientId: clientRef.id,
        clientName: companyName,
        stage: 'Inquiry',
        deliveryStatus: 'Not Started',
        ownerAmUid: deal.ownerId || null,
        ownerAmName: deal.ownerName || null,
        tenantId: dealTenantId,
        crmDealId: dealId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isDeleted: false,
      });
    }

    if (!existingInvoiceId && Number.isFinite(amount) && amount > 0) {
      tx.set(invoiceRef, {
        orderId: `DEAL-${dealId}`,
        clientId: clientRef.id,
        clientName: companyName,
        paymentToken: generateInvoiceToken(),
        currency,
        amountSubtotal: amount,
        amountTax: 0,
        amountTotal: amount,
        ...(currency === 'USD'
          ? { amountSubtotalUsd: amount, amountTaxUsd: 0, amountTotalUsd: amount }
          : {}),
        status: 'draft',
        totalPaid: 0,
        balanceDue: amount,
        dueDate: null,
        issuedAt: admin.firestore.FieldValue.serverTimestamp(),
        notes: 'Auto-generated from Closed Won deal.',
        tenantId: dealTenantId,
        crmDealId: dealId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isDeleted: false,
      });
    }

    tx.set(
      dealRef,
      {
        clientId: clientRef.id,
        projectId: projectRef.id,
        invoiceId:
          existingInvoiceId || (Number.isFinite(amount) && amount > 0 ? invoiceRef.id : null),
        closedWonProcessed: true,
        closedWonAt: deal.closedWonAt || admin.firestore.FieldValue.serverTimestamp(),
        tenantId: dealTenantId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      tenantId: dealTenantId,
      clientId: clientRef.id,
      projectId: projectRef.id,
      invoiceId:
        existingInvoiceId || (Number.isFinite(amount) && amount > 0 ? invoiceRef.id : null),
      created: !deal.closedWonProcessed,
    };
  });

  const clientSnap = await adminDb.collection('clients').doc(result.clientId).get();
  const clientData = clientSnap.data() || {};

  if (clientData.primaryContactEmail) {
    await queueClientActivationInvite({
      tenantId: result.tenantId,
      clientId: result.clientId,
      clientData: {
        primaryContactEmail: clientData.primaryContactEmail,
        primaryContactName: clientData.primaryContactName,
        companyName: clientData.companyName,
      },
      createdByUid: actor.uid,
      reason: 'closed_won_automation',
    });
  }

  if (result.created) {
    await logEvent({
      tenantId: result.tenantId,
      type: 'crm_closed_won_activated',
      title: 'Closed-won delivery activated',
      description: `Deal ${dealId} activated client ${result.clientId} and project ${result.projectId}`,
      entityType: 'deal',
      entityId: dealId,
      actor: {
        uid: actor.uid,
        name: actor.name || null,
      },
      metadata: {
        clientId: result.clientId,
        projectId: result.projectId,
        invoiceId: result.invoiceId,
      },
    });
  }

  return result;
}
