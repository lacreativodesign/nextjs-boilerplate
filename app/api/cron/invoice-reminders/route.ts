import admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebaseAdmin";

type ReminderType = "upcoming" | "due_today" | "overdue_1week" | "overdue_1month";

type InvoiceRecord = {
  id: string;
  tenantId: string;
  clientId: string;
  invoiceNumber: string;
  dueDate: string;
  total: number;
  status: "draft" | "sent" | "paid" | "overdue" | string;
  lateFeeApplied?: boolean;
  lateFee?: number;
  reminderCount?: number;
  lastReminderSent?: string;
};

type LateFeesSettings = {
  enabled: boolean;
  type: "percentage" | "fixed";
  value: number;
  gracePeriodDays: number;
};

type TenantRecord = {
  name?: string;
  lateFeesSettings?: Partial<LateFeesSettings>;
};

type ClientRecord = {
  email?: string;
  name?: string;
};

export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function GET(request: NextRequest) {
  try {
    if (!CRON_SECRET || CRON_SECRET === "change-me-in-production") {
      return NextResponse.json({ error: "Cron secret is not configured securely." }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[CRON] Starting invoice reminder job.");
    const results = await processInvoiceReminders();

    return NextResponse.json({ success: true, results }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[CRON] Invoice reminder job failed:", error);
    return NextResponse.json({ error: "Reminder job failed", details: message }, { status: 500 });
  }
}

async function processInvoiceReminders() {
  const results = {
    remindersSent: 0,
    lateFeesApplied: 0,
    markedOverdue: 0,
    errors: 0,
  };

  const tenantsSnapshot = await adminDb.collection("tenants").get();

  for (const tenantDoc of tenantsSnapshot.docs) {
    const tenantId = tenantDoc.id;
    const tenant = (tenantDoc.data() || {}) as TenantRecord;

    const invoicesSnapshot = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("invoices")
      .where("status", "in", ["sent", "overdue"])
      .get();

    for (const invoiceDoc of invoicesSnapshot.docs) {
      const raw = invoiceDoc.data() || {};
      const invoice: InvoiceRecord = {
        id: invoiceDoc.id,
        tenantId,
        clientId: String(raw.clientId || ""),
        invoiceNumber: String(raw.invoiceNumber || invoiceDoc.id),
        dueDate: String(raw.dueDate || ""),
        total: Number(raw.total || 0),
        status: String(raw.status || "sent"),
        lateFeeApplied: Boolean(raw.lateFeeApplied),
        lateFee: Number(raw.lateFee || 0),
        reminderCount: Number(raw.reminderCount || 0),
        lastReminderSent: raw.lastReminderSent ? String(raw.lastReminderSent) : undefined,
      };

      try {
        if (!invoice.clientId || !invoice.dueDate) {
          continue;
        }

        const reminderType = shouldSendReminder(invoice);
        if (reminderType) {
          const sent = await sendReminderEmail(tenantId, tenant, invoice, reminderType);
          if (sent) {
            await invoiceDoc.ref.update({
              lastReminderSent: new Date().toISOString(),
              reminderCount: (invoice.reminderCount || 0) + 1,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            results.remindersSent += 1;
          }
        }

        if (isOverdue(invoice) && !invoice.lateFeeApplied) {
          const applied = await applyLateFee(tenantId, invoice, tenant);
          if (applied) {
            results.lateFeesApplied += 1;
          }
        }

        if (isOverdue(invoice) && invoice.status !== "overdue") {
          await invoiceDoc.ref.update({
            status: "overdue",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          results.markedOverdue += 1;
        }
      } catch (error: unknown) {
        console.error(`[CRON] Error processing invoice=${invoice.id} tenant=${tenantId}:`, error);
        results.errors += 1;
      }
    }
  }

  return results;
}

function shouldSendReminder(invoice: InvoiceRecord): ReminderType | null {
  const today = startOfUtcDay(new Date());
  const due = startOfUtcDay(new Date(invoice.dueDate));
  if (Number.isNaN(due.getTime())) return null;

  const daysDiff = Math.floor((due.getTime() - today.getTime()) / MS_PER_DAY);

  const lastReminder = invoice.lastReminderSent ? new Date(invoice.lastReminderSent) : null;
  if (lastReminder && !Number.isNaN(lastReminder.getTime())) {
    const sinceLast = Math.floor((today.getTime() - startOfUtcDay(lastReminder).getTime()) / MS_PER_DAY);
    if (sinceLast < 1) return null;
  }

  if (daysDiff === 3) return "upcoming";
  if (daysDiff === 0) return "due_today";
  if (daysDiff === -7) return "overdue_1week";
  if (daysDiff === -30) return "overdue_1month";

  return null;
}

function isOverdue(invoice: InvoiceRecord): boolean {
  const today = startOfUtcDay(new Date());
  const due = startOfUtcDay(new Date(invoice.dueDate));
  if (Number.isNaN(due.getTime())) return false;
  return today.getTime() > due.getTime();
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

async function sendReminderEmail(
  tenantId: string,
  tenant: TenantRecord,
  invoice: InvoiceRecord,
  reminderType: ReminderType
): Promise<boolean> {
  if (!resend) {
    console.warn("[CRON] RESEND_API_KEY is missing; skipping reminder email send.");
    return false;
  }

  const client = await getClient(tenantId, invoice.clientId);
  if (!client?.email) return false;

  const subjects: Record<ReminderType, string> = {
    upcoming: `Reminder: Invoice ${invoice.invoiceNumber} due in 3 days`,
    due_today: `Invoice ${invoice.invoiceNumber} is due today`,
    overdue_1week: `Overdue: Invoice ${invoice.invoiceNumber}`,
    overdue_1month: `URGENT: Invoice ${invoice.invoiceNumber} is 30 days overdue`,
  };

  const messages: Record<ReminderType, string> = {
    upcoming: "This is a friendly reminder that your invoice will be due in 3 days.",
    due_today: "This invoice is due today. Please process payment at your earliest convenience.",
    overdue_1week: "This invoice is now 7 days overdue. Please contact us if you have any questions.",
    overdue_1month:
      "This invoice is now 30 days overdue. Immediate payment is required to avoid further action.",
  };

  const total = Number.isFinite(invoice.total) ? invoice.total : 0;

  await resend.emails.send({
    from: process.env.ONBOARDING_FROM_EMAIL || "Bizosto <onboarding@resend.dev>",
    to: client.email,
    subject: subjects[reminderType],
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h2 style="margin-bottom: 12px;">${subjects[reminderType]}</h2>
        <p style="margin-top: 0;">${messages[reminderType]}</p>

        <div style="background: #F9FAFB; border: 1px solid #E5E7EB; padding: 20px; border-radius: 8px; margin: 24px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>Amount Due:</strong> $${total.toFixed(2)}</p>
          <p style="margin: 0;"><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}</p>
        </div>

        <a href="https://bizosto.com/client/invoices/${invoice.id}"
           style="display: inline-block; background: #2563EB; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          View & Pay Invoice
        </a>

        <p style="color: #6B7280; font-size: 13px; margin-top: 28px;">
          If you have already paid this invoice, please disregard this reminder.
        </p>
      </div>
    `,
  });

  console.log(`[EMAIL] Sent ${reminderType} reminder for invoice=${invoice.invoiceNumber} tenant=${tenantId}`);
  return true;
}

async function getClient(tenantId: string, clientId: string): Promise<ClientRecord | null> {
  const byIdSnap = await adminDb.collection("tenants").doc(tenantId).collection("clients").doc(clientId).get();
  if (byIdSnap.exists) {
    return (byIdSnap.data() || {}) as ClientRecord;
  }

  const byFieldSnap = await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("clients")
    .where("id", "==", clientId)
    .limit(1)
    .get();

  if (byFieldSnap.empty) return null;
  return (byFieldSnap.docs[0].data() || {}) as ClientRecord;
}

async function applyLateFee(tenantId: string, invoice: InvoiceRecord, tenant: TenantRecord): Promise<boolean> {
  const settings: LateFeesSettings = {
    enabled: Boolean(tenant.lateFeesSettings?.enabled ?? true),
    type: tenant.lateFeesSettings?.type === "fixed" ? "fixed" : "percentage",
    value: Number(tenant.lateFeesSettings?.value ?? 5),
    gracePeriodDays: Math.max(0, Number(tenant.lateFeesSettings?.gracePeriodDays ?? 3)),
  };

  if (!settings.enabled) return false;

  const today = startOfUtcDay(new Date());
  const due = startOfUtcDay(new Date(invoice.dueDate));
  if (Number.isNaN(due.getTime())) return false;

  const daysOverdue = Math.floor((today.getTime() - due.getTime()) / MS_PER_DAY);
  if (daysOverdue <= settings.gracePeriodDays) return false;

  const lateFeeRaw =
    settings.type === "percentage" ? Number(invoice.total) * (settings.value / 100) : Number(settings.value);
  const lateFee = Number(Math.max(0, lateFeeRaw).toFixed(2));
  if (!Number.isFinite(lateFee) || lateFee <= 0) return false;

  const nextTotal = Number((Number(invoice.total) + lateFee).toFixed(2));

  await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("invoices")
    .doc(invoice.id)
    .update({
      lateFee,
      lateFeeApplied: true,
      lateFeeAppliedDate: new Date().toISOString(),
      total: nextTotal,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  console.log(`[LATE_FEE] Applied $${lateFee.toFixed(2)} for invoice=${invoice.invoiceNumber} tenant=${tenantId}`);
  return true;
}
