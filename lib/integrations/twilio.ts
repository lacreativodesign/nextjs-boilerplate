import crypto from "crypto";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

const TWILIO_DOC_ID = "twilio";
const TWILIO_LOGS_COLLECTION = "twilio_logs";
const TWILIO_OPTOUTS_COLLECTION = "twilio_opt_outs";

export const TWILIO_TRIGGER_TYPES = [
  "invoice_overdue_7_days",
  "high_priority_task_assigned",
  "project_deadline_approaching",
  "payment_received",
  "leave_request_urgent_approval",
  "system_alert",
] as const;

export type TwilioTriggerType = (typeof TWILIO_TRIGGER_TYPES)[number];

export type TwilioTemplateKey = TwilioTriggerType | "custom";

export type TwilioIntegrationConfig = {
  tenantId: string;
  enabled: boolean;
  accountSid: string | null;
  authToken: string | null;
  fromNumber: string | null;
  messagingServiceSid: string | null;
  statusCallbackUrl: string | null;
  enabledTriggers: TwilioTriggerType[];
  updatedAt?: FirebaseFirestore.FieldValue | string;
  updatedBy?: string;
};

type TwilioMessageApiResponse = {
  sid?: string;
  status?: string;
  error_code?: number | null;
  error_message?: string | null;
};

const TEMPLATE_CATALOG: Record<Exclude<TwilioTemplateKey, "custom">, string> = {
  invoice_overdue_7_days:
    "Invoice {{invoiceNumber}} is overdue by {{daysOverdue}} days. Amount: {{amount}}. Please review immediately.",
  high_priority_task_assigned:
    "High-priority task assigned: {{taskName}} (Project: {{projectName}}). Due: {{dueDate}}.",
  project_deadline_approaching:
    "Project {{projectName}} deadline is approaching on {{deadlineDate}}. Owner: {{ownerName}}.",
  payment_received:
    "Payment received: {{amount}} for invoice {{invoiceNumber}} from {{payerName}}.",
  leave_request_urgent_approval:
    "Urgent leave request pending approval for {{employeeName}} ({{leaveType}}) from {{startDate}} to {{endDate}}.",
  system_alert:
    "System alert [{{severity}}]: {{alertMessage}}",
};

function getBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export async function getTwilioIntegration(tenantId: string): Promise<TwilioIntegrationConfig | null> {
  const snap = await adminDb.collection("tenants").doc(tenantId).collection("integrations").doc(TWILIO_DOC_ID).get();
  if (!snap.exists) return null;
  return snap.data() as TwilioIntegrationConfig;
}

export async function updateTwilioIntegration(input: {
  tenantId: string;
  userUid: string;
  enabled: boolean;
  fromNumber: string | null;
  messagingServiceSid: string | null;
  statusCallbackUrl?: string | null;
  enabledTriggers: TwilioTriggerType[];
}) {
  await adminDb
    .collection("tenants")
    .doc(input.tenantId)
    .collection("integrations")
    .doc(TWILIO_DOC_ID)
    .set(
      {
        tenantId: input.tenantId,
        enabled: input.enabled,
        fromNumber: input.fromNumber,
        messagingServiceSid: input.messagingServiceSid,
        statusCallbackUrl: input.statusCallbackUrl || `${getBaseUrl()}/api/integrations/twilio/webhook`,
        enabledTriggers: input.enabledTriggers,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: input.userUid,
      } satisfies Partial<TwilioIntegrationConfig>,
      { merge: true }
    );
}

function getCredentials(config: TwilioIntegrationConfig | null) {
  const accountSid = String(config?.accountSid || process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(config?.authToken || process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are not configured.");
  }
  return { accountSid, authToken };
}

function normalizePhoneNumber(value: string) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Phone number is required.");
  const cleaned = raw.replace(/[\s()-]/g, "");
  const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) {
    throw new Error("Phone number must be in E.164 format (e.g. +15551234567).");
  }
  return withPlus;
}

function renderTemplate(template: string, variables: Record<string, unknown>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null ? `{{${key}}}` : String(value);
  });
}

export function previewSmsTemplate(templateKey: TwilioTemplateKey, variables: Record<string, unknown>) {
  if (templateKey === "custom") {
    return String(variables.message || "").trim();
  }
  return renderTemplate(TEMPLATE_CATALOG[templateKey], variables).slice(0, 1600);
}

async function isOptedOut(tenantId: string, phone: string) {
  const snap = await adminDb.collection("tenants").doc(tenantId).collection(TWILIO_OPTOUTS_COLLECTION).doc(phone).get();
  return snap.exists;
}

export async function listTwilioLogs(tenantId: string, limit = 50) {
  const snapshot = await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection(TWILIO_LOGS_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(Math.max(1, Math.min(limit, 200)))
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function sendTwilioNotification(input: {
  tenantId: string;
  userUid: string;
  to: string;
  templateKey: TwilioTemplateKey;
  variables?: Record<string, unknown>;
  triggerType?: TwilioTriggerType;
  metadata?: Record<string, unknown>;
}) {
  const config = await getTwilioIntegration(input.tenantId);
  if (!config?.enabled) {
    throw new Error("Twilio integration is disabled for this tenant.");
  }

  if (input.triggerType && !(config.enabledTriggers || []).includes(input.triggerType)) {
    throw new Error(`Trigger is disabled: ${input.triggerType}`);
  }

  const to = normalizePhoneNumber(input.to);
  if (await isOptedOut(input.tenantId, to)) {
    throw new Error(`Recipient has opted out of SMS notifications: ${to}`);
  }

  const message = previewSmsTemplate(input.templateKey, input.variables || {});
  if (!message) throw new Error("SMS message is empty.");

  const { accountSid, authToken } = getCredentials(config);
  const statusCallbackUrl = String(config.statusCallbackUrl || `${getBaseUrl()}/api/integrations/twilio/webhook`).trim();

  const fromNumber = String(config.fromNumber || process.env.TWILIO_FROM_NUMBER || "").trim();
  const messagingServiceSid = String(config.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  if (!fromNumber && !messagingServiceSid) {
    throw new Error("Twilio sender is not configured. Configure From Number or Messaging Service SID.");
  }

  const logRef = adminDb.collection("tenants").doc(input.tenantId).collection(TWILIO_LOGS_COLLECTION).doc();
  await logRef.set({
    tenantId: input.tenantId,
    to,
    templateKey: input.templateKey,
    triggerType: input.triggerType || null,
    message,
    status: "queued",
    provider: "twilio",
    messageSid: null,
    metadata: input.metadata || {},
    createdBy: input.userUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const body = new URLSearchParams({
    To: to,
    Body: message,
    StatusCallback: statusCallbackUrl,
  });

  if (messagingServiceSid) {
    body.set("MessagingServiceSid", messagingServiceSid);
  } else {
    body.set("From", fromNumber);
  }

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = (await response.json().catch(() => ({}))) as TwilioMessageApiResponse;
    if (!response.ok || !data.sid) {
      const errorMessage = data.error_message || `Twilio API request failed with status ${response.status}.`;
      await logRef.set(
        {
          status: "failed",
          errorCode: data.error_code || null,
          errorMessage,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      throw new Error(errorMessage);
    }

    await logRef.set(
      {
        status: data.status || "sent",
        messageSid: data.sid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { id: logRef.id, messageSid: data.sid, status: data.status || "sent" };
  } catch (error: any) {
    await logRef.set(
      {
        status: "failed",
        errorMessage: error?.message || "Unknown Twilio send error.",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw error;
  }
}


export async function sendTwilioTriggerNotification(input: {
  tenantId: string;
  userUid: string;
  to: string;
  triggerType: TwilioTriggerType;
  variables: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return sendTwilioNotification({
    tenantId: input.tenantId,
    userUid: input.userUid,
    to: input.to,
    templateKey: input.triggerType,
    triggerType: input.triggerType,
    variables: input.variables,
    metadata: input.metadata,
  });
}

export async function handleTwilioWebhook(input: {
  accountSid?: string;
  messageSid?: string;
  messageStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  from?: string;
  body?: string;
}) {
  const incomingBody = String(input.body || "").trim().toUpperCase();
  const from = input.from ? normalizePhoneNumber(input.from) : null;

  if (from && ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(incomingBody)) {
    if (!input.accountSid) throw new Error("AccountSid is required for opt-out processing.");

    const integrationSnap = await adminDb
      .collectionGroup("integrations")
      .where(admin.firestore.FieldPath.documentId(), "==", TWILIO_DOC_ID)
      .where("accountSid", "==", input.accountSid)
      .limit(1)
      .get();

    if (!integrationSnap.empty) {
      const integrationDoc = integrationSnap.docs[0];
      const tenantRef = integrationDoc.ref.parent.parent;
      if (tenantRef) {
        await tenantRef.collection(TWILIO_OPTOUTS_COLLECTION).doc(from).set({
          phone: from,
          source: "twilio_webhook",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  if (!input.messageSid) return;

  const logSnapshot = await adminDb.collectionGroup(TWILIO_LOGS_COLLECTION).where("messageSid", "==", input.messageSid).limit(1).get();
  if (logSnapshot.empty) return;

  await logSnapshot.docs[0].ref.set(
    {
      status: String(input.messageStatus || "unknown"),
      delivery: {
        messageStatus: input.messageStatus || null,
        errorCode: input.errorCode || null,
        errorMessage: input.errorMessage || null,
      },
      deliveredAt: ["delivered", "read"].includes(String(input.messageStatus || "").toLowerCase())
        ? admin.firestore.FieldValue.serverTimestamp()
        : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export function verifyTwilioWebhookSignature(input: {
  signature: string | null;
  url: string;
  params: Record<string, string>;
  authToken?: string;
}) {
  const signature = String(input.signature || "").trim();
  const authToken = String(input.authToken || process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!signature || !authToken) return false;

  const sortedKeys = Object.keys(input.params).sort();
  const data = sortedKeys.reduce((acc, key) => `${acc}${key}${input.params[key]}`, input.url);
  const digest = crypto.createHmac("sha1", authToken).update(data).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
