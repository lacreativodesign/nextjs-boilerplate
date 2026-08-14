import { NextRequest, NextResponse } from 'next/server';
import { invoiceEmailHtml, invoiceEmailSubject } from '@/lib/email/html-templates';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { enqueueTenantEmail } from '@/lib/email/outbox';
import { type TenantSenderSource } from '@/lib/email/tenant-sender';
import { invoicePaymentUrl } from '@/lib/urls';

export const runtime = 'nodejs';

type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

type RecurringTemplate = {
  status?: 'draft' | 'active' | 'paused' | 'cancelled';
  tenantId?: string;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate?: string | null;
  clientId: string;
  clientEmail?: string;
  invoiceData: Record<string, unknown> & { paymentTerms?: number; total?: number };
  generatedCount?: number;
  nextGenerateDate?: string;
};

type GeneratedInvoice = {
  id: string;
  invoiceNumber: string;
  dueDate: string;
  total: number;
};

const CRON_SECRET = process.env.CRON_SECRET;

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

    // FM-14 (E4c): Recurring invoicing is a deferred, not-yet-wired feature. It
    // writes to the tenant subcollection tenants/{id}/invoices, which the Finance
    // module, AR reports, revenue, and the public pay page never read (they use
    // the top-level `invoices` collection). Running it would silently create
    // orphaned invoices with no ledger entry that no user can see or pay. It is
    // therefore disabled at launch and no-ops unless explicitly enabled. To turn
    // it on it must first be migrated to the canonical top-level invoice shape
    // (orderId, paymentToken, amount fields, status, isDeleted) with an
    // invoice.created ledger entry — see the E4c note in docs/audit.
    if (process.env.ERP_ENABLE_RECURRING_INVOICES !== 'true') {
      console.log('[CRON] Recurring invoice generation is deferred — skipping (no-op).');
      return NextResponse.json(
        {
          success: true,
          skipped: true,
          message:
            'Recurring invoice generation is deferred and disabled at launch. Set ERP_ENABLE_RECURRING_INVOICES=true only after migrating to the top-level invoices collection.',
        },
        { status: 200 },
      );
    }

    console.log('[CRON] Starting recurring invoice generation.');
    const results = await generateRecurringInvoices();

    return NextResponse.json(
      {
        success: true,
        message: `Generated ${results.success} invoices, ${results.errors} failed, ${results.skipped} skipped`,
        details: results,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRON] Invoice generation failed:', error);
    return NextResponse.json(
      {
        error: 'Invoice generation failed',
        details: message,
      },
      { status: 500 },
    );
  }
}

async function generateRecurringInvoices() {
  const results = {
    success: 0,
    errors: 0,
    skipped: 0,
    details: [] as Array<Record<string, unknown>>,
  };

  const tenantsSnapshot = await adminDb.collection('tenants').get();

  for (const tenantDoc of tenantsSnapshot.docs) {
    const tenantId = tenantDoc.id;
    console.log(`[CRON] Processing tenant ${tenantId}`);

    // P3-3: recurring templates are stored in the top-level `recurring_invoice_templates`
    // collection (with a tenantId field), which is where every CRUD route writes them.
    // The previous read of a per-tenant `recurringInvoiceTemplates` subcollection with an
    // `isActive` flag targeted a collection nothing writes, so no recurring invoices were
    // ever generated. Read the canonical collection, filtered by tenant and active status.
    const templatesSnapshot = await adminDb
      .collection('recurring_invoice_templates')
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'active')
      .get();

    for (const templateDoc of templatesSnapshot.docs) {
      const templateId = templateDoc.id;
      const template = templateDoc.data() as RecurringTemplate;

      try {
        if (!isTemplateValid(template)) {
          results.skipped += 1;
          results.details.push({
            tenantId,
            templateId,
            status: 'skipped',
            reason: 'invalid_template',
          });
          continue;
        }

        if (!shouldGenerateInvoice(template)) {
          results.skipped += 1;
          continue;
        }

        const invoice = await createInvoiceFromTemplate(tenantId, template);
        const clientEmail = await resolveClientEmail(tenantId, template);

        if (clientEmail) {
          await sendInvoiceEmail(
            invoice,
            clientEmail,
            tenantId,
            tenantDoc.data() as TenantSenderSource,
          );
        } else {
          console.warn(
            `[EMAIL] Client email missing for tenant=${tenantId}, template=${templateId}`,
          );
        }

        await templateDoc.ref.update({
          lastGeneratedDate: new Date().toISOString(),
          nextGenerateDate: calculateNextGenerateDate(template.frequency, new Date()),
          generatedCount: (template.generatedCount ?? 0) + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        results.success += 1;
        results.details.push({ tenantId, templateId, invoiceId: invoice.id, status: 'success' });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[CRON] Failed template ${templateId} for tenant ${tenantId}:`, error);
        results.errors += 1;
        results.details.push({ tenantId, templateId, status: 'error', error: message });
      }
    }
  }

  return results;
}

function isTemplateValid(template: Partial<RecurringTemplate>): template is RecurringTemplate {
  return Boolean(
    template &&
    template.clientId &&
    template.invoiceData &&
    template.startDate &&
    template.frequency &&
    ['daily', 'weekly', 'monthly', 'yearly'].includes(template.frequency),
  );
}

function shouldGenerateInvoice(template: RecurringTemplate): boolean {
  const now = new Date();
  const startDate = new Date(template.startDate);
  if (Number.isNaN(startDate.getTime())) return false;

  const endDate = template.endDate ? new Date(template.endDate) : null;
  if (endDate && Number.isNaN(endDate.getTime())) return false;

  if (now < startDate) return false;
  if (endDate && now > endDate) return false;

  const nextGenerateDate = template.nextGenerateDate
    ? new Date(template.nextGenerateDate)
    : startDate;
  if (Number.isNaN(nextGenerateDate.getTime())) return false;

  return now >= nextGenerateDate;
}

async function createInvoiceFromTemplate(
  tenantId: string,
  template: RecurringTemplate,
): Promise<GeneratedInvoice> {
  const now = new Date();
  const paymentTerms = Number(template.invoiceData.paymentTerms ?? 30);
  const invoiceNumber = await generateInvoiceNumber(tenantId);

  const invoiceData = {
    ...template.invoiceData,
    tenantId,
    clientId: template.clientId,
    invoiceNumber,
    issueDate: now.toISOString(),
    dueDate: calculateDueDate(paymentTerms),
    status: 'sent',
    generatedFrom: 'recurring_template',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const invoiceRef = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('invoices')
    .add(invoiceData);

  return {
    id: invoiceRef.id,
    invoiceNumber,
    dueDate: String(invoiceData.dueDate),
    total: Number(template.invoiceData.total ?? 0),
  };
}

async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const latestInvoiceSnapshot = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('invoices')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  const currentYear = new Date().getFullYear();
  if (latestInvoiceSnapshot.empty) {
    return `INV-${currentYear}-0001`;
  }

  const lastInvoiceNumber = String(latestInvoiceSnapshot.docs[0].data().invoiceNumber ?? '');
  const sequenceMatch = lastInvoiceNumber.match(/INV-\d{4}-(\d+)$/);

  if (!sequenceMatch) {
    return `INV-${currentYear}-${String(Date.now()).slice(-4)}`;
  }

  const nextSequence = Number(sequenceMatch[1]) + 1;
  return `INV-${currentYear}-${String(nextSequence).padStart(4, '0')}`;
}

function calculateDueDate(paymentTerms: number): string {
  const normalizedTerms = Number.isFinite(paymentTerms) && paymentTerms > 0 ? paymentTerms : 30;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + normalizedTerms);
  return dueDate.toISOString();
}

function calculateNextGenerateDate(frequency: RecurrenceFrequency, fromDate: Date): string {
  const next = new Date(fromDate);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }

  return next.toISOString();
}

async function resolveClientEmail(
  tenantId: string,
  template: RecurringTemplate,
): Promise<string | null> {
  if (template.clientEmail) return template.clientEmail;

  const clientDoc = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('clients')
    .doc(template.clientId)
    .get();

  if (!clientDoc.exists) return null;

  const email = clientDoc.data()?.email;
  return typeof email === 'string' && email.length > 0 ? email : null;
}

async function sendInvoiceEmail(
  invoice: GeneratedInvoice,
  clientEmail: string,
  tenantId: string,
  tenant: TenantSenderSource,
) {
  const invoiceData = {
    clientName: clientEmail,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.total,
    currency: 'USD',
    dueDate: new Date(invoice.dueDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    // P0-4b: /client/invoices/{id} has never existed. The payable page is /pay/{id}.
    viewUrl: invoicePaymentUrl(invoice.id),
  };

  try {
    // MAIL-4: an invoice is the TENANT billing its own customer, and it is the first
    // message that customer receives about the money owed, so it is addressed as the
    // tenant rather than as Bizosto.
    //
    // MAIL-5: and it goes through the outbox, because this is the send with the worst
    // failure mode in the product. The invoice is already created and owed; if the
    // provider is down for the minute this job runs, the old code logged a line and moved
    // on — the customer never received the bill, nothing retried, and the finance screen
    // showed an invoice sent. A brief outage at 01:00 on the first of the month silently
    // un-billed a month of recurring revenue for every tenant at once.
    await enqueueTenantEmail({
      tenantId,
      to: clientEmail,
      subject: invoiceEmailSubject(invoiceData),
      html: invoiceEmailHtml(invoiceData),
      messageClass: 'invoice.issued',
      entityId: invoice.id,
      tenant,
    });

    // S23: never log the recipient's email address. invoice.id is a non-PII identifier
    // that is just as useful for tracing a delivery in the logs.
    console.log(`[EMAIL] Sent invoice ${invoice.invoiceNumber} (${invoice.id})`);
  } catch (error) {
    console.error('[EMAIL] Failed to send invoice email:', error);
  }
}
