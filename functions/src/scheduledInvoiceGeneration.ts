// @ts-nocheck
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Resend } from "resend";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

type RecurringTemplate = {
  isActive?: boolean;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate?: string | null;
  clientId: string;
  clientEmail?: string;
  invoiceData: Record<string, unknown> & { paymentTerms?: number; total?: number };
  generatedCount?: number;
  nextGenerateDate?: string;
};

export const generateRecurringInvoices = functions.pubsub
  .schedule("every day 00:00")
  .timeZone("America/New_York")
  .onRun(async () => {
    const tenantsSnapshot = await db.collection("tenants").get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const tenantId = tenantDoc.id;

      const templatesSnapshot = await db
        .collection("tenants")
        .doc(tenantId)
        .collection("recurringInvoiceTemplates")
        .where("isActive", "==", true)
        .get();

      for (const templateDoc of templatesSnapshot.docs) {
        const template = templateDoc.data() as RecurringTemplate;

        if (!shouldGenerateInvoice(template)) {
          continue;
        }

        const invoice = await createInvoiceFromTemplate(tenantId, template);
        const clientEmail = await resolveClientEmail(tenantId, template);

        if (clientEmail) {
          await sendInvoiceEmail(invoice, clientEmail);
        }

        await templateDoc.ref.update({
          lastGeneratedDate: new Date().toISOString(),
          nextGenerateDate: calculateNextGenerateDate(template.frequency, new Date()),
          generatedCount: (template.generatedCount ?? 0) + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    console.log("[Firebase Function] Recurring invoice generation completed.");
    return null;
  });

function shouldGenerateInvoice(template: RecurringTemplate): boolean {
  if (!template?.startDate || !template?.frequency) return false;

  const now = new Date();
  const startDate = new Date(template.startDate);
  if (Number.isNaN(startDate.getTime())) return false;

  const endDate = template.endDate ? new Date(template.endDate) : null;
  if (endDate && Number.isNaN(endDate.getTime())) return false;

  if (now < startDate) return false;
  if (endDate && now > endDate) return false;

  const nextGenerateDate = template.nextGenerateDate ? new Date(template.nextGenerateDate) : startDate;
  if (Number.isNaN(nextGenerateDate.getTime())) return false;

  return now >= nextGenerateDate;
}

async function createInvoiceFromTemplate(tenantId: string, template: RecurringTemplate) {
  const now = new Date();
  const paymentTerms = Number(template.invoiceData?.paymentTerms ?? 30);
  const invoiceNumber = await generateInvoiceNumber(tenantId);

  const payload = {
    ...template.invoiceData,
    tenantId,
    clientId: template.clientId,
    invoiceNumber,
    issueDate: now.toISOString(),
    dueDate: calculateDueDate(paymentTerms),
    status: "sent",
    generatedFrom: "recurring_template",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("tenants").doc(tenantId).collection("invoices").add(payload);

  return {
    id: ref.id,
    invoiceNumber,
    dueDate: String(payload.dueDate),
    total: Number(template.invoiceData?.total ?? 0),
  };
}

async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const latest = await db
    .collection("tenants")
    .doc(tenantId)
    .collection("invoices")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  const year = new Date().getFullYear();
  if (latest.empty) return `INV-${year}-0001`;

  const lastNumber = String(latest.docs[0].data().invoiceNumber ?? "");
  const sequenceMatch = lastNumber.match(/INV-\d{4}-(\d+)$/);
  if (!sequenceMatch) return `INV-${year}-${String(Date.now()).slice(-4)}`;

  return `INV-${year}-${String(Number(sequenceMatch[1]) + 1).padStart(4, "0")}`;
}

function calculateDueDate(paymentTerms: number): string {
  const terms = Number.isFinite(paymentTerms) && paymentTerms > 0 ? paymentTerms : 30;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + terms);
  return dueDate.toISOString();
}

function calculateNextGenerateDate(frequency: RecurrenceFrequency, fromDate: Date): string {
  const next = new Date(fromDate);
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next.toISOString();
}

async function resolveClientEmail(tenantId: string, template: RecurringTemplate): Promise<string | null> {
  if (template.clientEmail) return template.clientEmail;

  const snap = await db.collection("tenants").doc(tenantId).collection("clients").doc(template.clientId).get();
  if (!snap.exists) return null;

  const email = snap.data()?.email;
  return typeof email === "string" && email.length > 0 ? email : null;
}

async function sendInvoiceEmail(
  invoice: { id: string; invoiceNumber: string; dueDate: string; total: number },
  clientEmail: string
) {
  if (!resend) {
    console.warn("[Firebase Function][EMAIL] RESEND_API_KEY not configured; skipping email delivery.");
    return;
  }

  try {
    await resend.emails.send({
      from: "Bizosto <noreply@bizosto.com>",
      to: clientEmail,
      subject: `New Invoice ${invoice.invoiceNumber}`,
      html: `
        <h2>New Invoice Generated</h2>
        <p>Invoice Number: ${invoice.invoiceNumber}</p>
        <p>Amount: $${invoice.total.toFixed(2)}</p>
        <p>Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}</p>
        <p><a href="https://bizosto.com/client/invoices/${invoice.id}">View Invoice</a></p>
      `,
    });
  } catch (error) {
    console.error("[Firebase Function][EMAIL] Failed to send invoice email:", error);
  }
}
