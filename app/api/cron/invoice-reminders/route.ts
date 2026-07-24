import admin from 'firebase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { adminDb } from '@/lib/firebaseAdmin';
import { mutateFinanceInTransaction } from '@/lib/finance/ledger';
import {
  REMINDABLE_STATUSES,
  computeLateFee,
  isOverdue,
  resolveLateFeeSettings,
  selectReminderType,
  toDate,
  type LateFeeSettings,
  type ReminderType,
  type ScheduleInvoice,
} from '@/lib/finance/invoice-schedule';

/**
 * Invoice reminder cron (P0-4a).
 *
 * This job never did anything. It iterated `tenants/{id}/invoices` and
 * `tenants/{id}/clients` — subcollections that nothing in the product writes to. Invoices
 * live at top-level `invoices` with a `tenantId` field, clients at top-level `clients`. The
 * record shape was wrong too: an invoice-number field vs `orderId`, a flat total vs
 * `amountTotal`/`balanceDue`, an ISO-string dueDate vs a Firestore Timestamp, and statuses
 * `sent`/`overdue` which are not canonical tokens (lib/finance/status.ts).
 *
 * Changes here:
 *  - reads the canonical collection and schema
 *  - one paginated pass over `invoices` instead of a full scan per tenant, with a hard
 *    document budget so the job cannot silently exceed the serverless execution limit
 *  - never writes the non-canonical status `overdue`; overdue is derived and recorded as
 *    `overdueSince`, leaving `status` on the canonical token set
 *  - late fees route through mutateFinanceInTransaction so the append-only finance ledger
 *    records the adjustment atomically, and are OFF unless ERP_ENABLE_INVOICE_LATE_FEES=true
 *  - payment links point at /pay/{id}?token=… , the route that actually exists
 */

type TenantRecord = {
  name?: string;
  lateFeesSettings?: Partial<LateFeeSettings>;
};

type ClientRecord = {
  email?: string;
  name?: string;
};

export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/**
 * Late fees mutate invoice totals. This code path has never successfully executed against
 * real data, so it stays behind an explicit flag until it has been exercised in staging —
 * same posture as ERP_ENABLE_RECURRING_INVOICES.
 */
const LATE_FEES_ENABLED = process.env.ERP_ENABLE_INVOICE_LATE_FEES === 'true';

/** Hard ceiling per run so a growing invoice table cannot silently time the job out. */
const MAX_INVOICES_PER_RUN = 2000;
const PAGE_SIZE = 200;

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.bizosto.com').replace(/\/+$/, '');

const SYSTEM_ACTOR = { uid: 'system:cron:invoice-reminders', name: 'Invoice reminder cron' };

export async function GET(request: NextRequest) {
  try {
    if (!CRON_SECRET || CRON_SECRET === 'change-me-in-production') {
      return NextResponse.json(
        { error: 'Cron secret is not configured securely.' },
        { status: 500 },
      );
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[CRON] Starting invoice reminder job.');
    const results = await processInvoiceReminders();

    return NextResponse.json({ success: true, results }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRON] Invoice reminder job failed:', error);
    return NextResponse.json({ error: 'Reminder job failed', details: message }, { status: 500 });
  }
}

async function processInvoiceReminders() {
  const results = {
    scanned: 0,
    remindersSent: 0,
    lateFeesApplied: 0,
    markedOverdue: 0,
    errors: 0,
    truncated: false,
    lateFeesEnabled: LATE_FEES_ENABLED,
  };

  const today = new Date();
  const tenantCache = new Map<string, TenantRecord>();
  const clientCache = new Map<string, ClientRecord | null>();

  let cursor: admin.firestore.QueryDocumentSnapshot | null = null;

  while (results.scanned < MAX_INVOICES_PER_RUN) {
    let query = adminDb
      .collection('invoices')
      .where('isDeleted', '==', false)
      .where('status', 'in', [...REMINDABLE_STATUSES])
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const page = await query.get();
    if (page.empty) break;

    for (const doc of page.docs) {
      results.scanned += 1;
      const raw = doc.data() || {};

      const tenantId = String(raw.tenantId || '').trim();
      if (!tenantId) {
        // Without a tenant we cannot resolve settings or address a client safely.
        continue;
      }

      const invoice: ScheduleInvoice = {
        id: doc.id,
        tenantId,
        clientId: String(raw.clientId || ''),
        orderId: String(raw.orderId || doc.id),
        status: String(raw.status || ''),
        amountTotal: Number(raw.amountTotal ?? 0),
        balanceDue: Number(raw.balanceDue ?? raw.amountTotal ?? 0),
        dueDate: raw.dueDate,
        lateFeeApplied: Boolean(raw.lateFeeApplied),
        reminderCount: Number(raw.reminderCount || 0),
        lastReminderSent: raw.lastReminderSent,
      };

      try {
        const tenant = await loadTenant(tenantId, tenantCache);

        const reminderType = selectReminderType(invoice, today);
        if (reminderType) {
          const sent = await sendReminderEmail({
            tenant,
            invoice,
            reminderType,
            paymentToken: String(raw.paymentToken || ''),
            currencySymbol: String(raw.currencySymbol || '$'),
            clientCache,
          });
          if (sent) {
            await doc.ref.update({
              lastReminderSent: admin.firestore.Timestamp.fromDate(today),
              reminderCount: (invoice.reminderCount || 0) + 1,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            results.remindersSent += 1;
          }
        }

        const overdue = isOverdue(invoice, today);

        if (overdue && !raw.overdueSince) {
          // `overdue` is NOT a canonical invoice status. Record it as derived metadata and
          // leave `status` on the canonical token set (draft|issued|partially_paid|paid|void).
          await doc.ref.update({
            overdueSince: admin.firestore.Timestamp.fromDate(today),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          results.markedOverdue += 1;
        }

        if (LATE_FEES_ENABLED) {
          const settings = resolveLateFeeSettings(tenant.lateFeesSettings);
          const fee = computeLateFee(invoice, settings, today);
          if (fee > 0) {
            await applyLateFee(invoice, fee);
            results.lateFeesApplied += 1;
          }
        }
      } catch (error: unknown) {
        console.error(`[CRON] Error processing invoice=${doc.id} tenant=${tenantId}:`, error);
        results.errors += 1;
      }
    }

    cursor = page.docs[page.docs.length - 1];
    if (page.size < PAGE_SIZE) break;
  }

  if (results.scanned >= MAX_INVOICES_PER_RUN) {
    results.truncated = true;
    console.warn(
      `[CRON] Invoice reminder job hit the ${MAX_INVOICES_PER_RUN} document budget; remaining invoices will be picked up on the next run.`,
    );
  }

  return results;
}

async function loadTenant(
  tenantId: string,
  cache: Map<string, TenantRecord>,
): Promise<TenantRecord> {
  const cached = cache.get(tenantId);
  if (cached) return cached;

  const snap = await adminDb.collection('tenants').doc(tenantId).get();
  const tenant = (snap.data() || {}) as TenantRecord;
  cache.set(tenantId, tenant);
  return tenant;
}

async function loadClient(
  tenantId: string,
  clientId: string,
  cache: Map<string, ClientRecord | null>,
): Promise<ClientRecord | null> {
  const key = `${tenantId}:${clientId}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const snap = await adminDb.collection('clients').doc(clientId).get();
  const data = snap.exists ? ((snap.data() || {}) as ClientRecord & { tenantId?: string }) : null;

  // Tenant isolation: a client id from one tenant must never address another tenant's client.
  const resolved = data && String(data.tenantId || '') === tenantId ? data : null;

  cache.set(key, resolved);
  return resolved;
}

/**
 * Late fees are a financial mutation, so the invoice write and the append-only ledger entry
 * land in the same transaction. `mutateFinanceInTransaction` throws if no entry is staged.
 */
async function applyLateFee(invoice: ScheduleInvoice, fee: number): Promise<void> {
  await mutateFinanceInTransaction(async ({ tx, ledger }) => {
    const ref = adminDb.collection('invoices').doc(invoice.id);
    const snap = await tx.get(ref);
    if (!snap.exists) return;

    const current = snap.data() || {};

    // Re-check inside the transaction: the invoice may have been paid, voided or already
    // charged between the read that queued this fee and now.
    if (current.lateFeeApplied) return;
    if (!(REMINDABLE_STATUSES as readonly string[]).includes(String(current.status || ''))) return;
    if (Number(current.balanceDue ?? 0) <= 0) return;

    const amountTotal = Number(current.amountTotal ?? 0);
    const balanceDue = Number(current.balanceDue ?? 0);

    tx.update(ref, {
      lateFee: fee,
      lateFeeApplied: true,
      lateFeeAppliedAt: admin.firestore.FieldValue.serverTimestamp(),
      amountTotal: Number((amountTotal + fee).toFixed(2)),
      balanceDue: Number((balanceDue + fee).toFixed(2)),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    ledger({
      tenantId: invoice.tenantId,
      type: 'adjustment.created',
      invoiceId: invoice.id,
      orderId: invoice.orderId,
      clientId: invoice.clientId,
      amountUsd: fee,
      reason: `Automatic late fee applied by the invoice reminder cron for overdue invoice ${invoice.orderId}.`,
      actor: SYSTEM_ACTOR,
    });
  });

  console.log(`[LATE_FEE] Applied ${fee.toFixed(2)} to invoice=${invoice.orderId}`);
}

async function sendReminderEmail(params: {
  tenant: TenantRecord;
  invoice: ScheduleInvoice;
  reminderType: ReminderType;
  paymentToken: string;
  currencySymbol: string;
  clientCache: Map<string, ClientRecord | null>;
}): Promise<boolean> {
  const { tenant, invoice, reminderType, paymentToken, currencySymbol, clientCache } = params;

  if (!resend) {
    console.warn('[CRON] RESEND_API_KEY is missing; skipping reminder email send.');
    return false;
  }

  const client = await loadClient(invoice.tenantId, invoice.clientId, clientCache);
  if (!client?.email) return false;

  const subjects: Record<ReminderType, string> = {
    upcoming: `Reminder: Invoice ${invoice.orderId} due in 3 days`,
    due_today: `Invoice ${invoice.orderId} is due today`,
    overdue_1week: `Overdue: Invoice ${invoice.orderId}`,
    overdue_1month: `URGENT: Invoice ${invoice.orderId} is 30 days overdue`,
  };

  const messages: Record<ReminderType, string> = {
    upcoming: 'This is a friendly reminder that your invoice will be due in 3 days.',
    due_today: 'This invoice is due today. Please process payment at your earliest convenience.',
    overdue_1week:
      'This invoice is now 7 days overdue. Please contact us if you have any questions.',
    overdue_1month:
      'This invoice is now 30 days overdue. Immediate payment is required to avoid further action.',
  };

  const balanceDue = Number.isFinite(invoice.balanceDue) ? invoice.balanceDue : 0;
  const due = toDate(invoice.dueDate);
  const dueLabel = due ? due.toISOString().slice(0, 10) : 'on file';

  // FIN-002: the previous link pointed at a client invoice path that does not exist in the
  // route tree. The payable page is /pay/{id} and it reads the token from the query string.
  // The canonical URL builder lands in P0-4(c); this is the correct link in the meantime.
  const payUrl = paymentToken
    ? `${APP_URL}/pay/${invoice.id}?token=${encodeURIComponent(paymentToken)}`
    : `${APP_URL}/pay/${invoice.id}`;

  await resend.emails.send({
    from: 'Bizosto <invoices@bizosto.com>',
    to: client.email,
    subject: subjects[reminderType],
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h2 style="margin-bottom: 12px;">${subjects[reminderType]}</h2>
        <p style="margin-top: 0;">${messages[reminderType]}</p>

        <div style="background: #F9FAFB; border: 1px solid #E5E7EB; padding: 20px; border-radius: 8px; margin: 24px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Invoice Number:</strong> ${invoice.orderId}</p>
          <p style="margin: 0 0 8px 0;"><strong>Amount Due:</strong> ${currencySymbol}${balanceDue.toFixed(2)}</p>
          <p style="margin: 0;"><strong>Due Date:</strong> ${dueLabel}</p>
        </div>

        <a href="${payUrl}"
           style="display: inline-block; background: #2563EB; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          View &amp; Pay Invoice
        </a>

        <p style="color: #6B7280; font-size: 13px; margin-top: 28px;">
          If you have already paid this invoice, please disregard this reminder.
          ${tenant.name ? `Sent on behalf of ${tenant.name}.` : ''}
        </p>
      </div>
    `,
  });

  console.log(`[EMAIL] Sent ${reminderType} reminder for invoice=${invoice.orderId}`);
  return true;
}
