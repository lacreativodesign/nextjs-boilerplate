import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

const ZAPIER_HOOKS_COLLECTION = "zapier_hook_subscriptions";
const ZAPIER_EVENTS_COLLECTION = "zapier_events";

export const ZAPIER_TRIGGER_TO_EVENT = {
  new_invoice_created: "invoice.created",
  invoice_paid: "invoice.paid",
  new_client_added: "client.created",
  task_completed: "task.completed",
  project_status_changed: "project.status_changed",
  payment_received: "payment.received",
  leave_request_submitted: "leave.requested",
} as const;

export type ZapierTriggerKey = keyof typeof ZAPIER_TRIGGER_TO_EVENT;

type ZapierActor = {
  uid: string;
  email?: string | null;
  role?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value: unknown) {
  return String(value || "").trim();
}

export async function resolveZapierTenant(apiKeyRaw: unknown) {
  const apiKey = cleanString(apiKeyRaw);
  if (!apiKey) return null;

  const snap = await adminDb.collection("tenants").where("apiKey", "==", apiKey).limit(1).get();
  if (snap.empty) return null;

  const tenantDoc = snap.docs[0];
  return {
    tenantId: tenantDoc.id,
    tenant: tenantDoc.data() || {},
  };
}

export async function createZapierHookSubscription(params: {
  tenantId: string;
  triggerKey: ZapierTriggerKey;
  targetUrl: string;
}) {
  const ref = adminDb.collection(ZAPIER_HOOKS_COLLECTION).doc();
  const createdAt = nowIso();

  const record = {
    tenantId: params.tenantId,
    triggerKey: params.triggerKey,
    eventName: ZAPIER_TRIGGER_TO_EVENT[params.triggerKey],
    targetUrl: params.targetUrl,
    status: "active",
    createdAt,
    updatedAt: createdAt,
    lastTriggeredAt: null as string | null,
  };

  await ref.set(record);
  return { id: ref.id, ...record };
}

export async function deleteZapierHookSubscription(params: { id: string; tenantId: string }) {
  const ref = adminDb.collection(ZAPIER_HOOKS_COLLECTION).doc(params.id);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const data = snap.data() || {};
  if (String(data.tenantId || "") !== params.tenantId) return false;

  await ref.delete();
  return true;
}

export async function dispatchZapierTriggerEvent(params: {
  tenantId: string;
  eventName: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  actor: ZapierActor;
}) {
  const createdAt = nowIso();
  const eventRef = adminDb.collection(ZAPIER_EVENTS_COLLECTION).doc();

  const eventRecord = {
    id: eventRef.id,
    tenantId: params.tenantId,
    eventName: params.eventName,
    entityType: params.entityType,
    entityId: params.entityId,
    payload: params.payload,
    actor: {
      uid: params.actor.uid,
      email: params.actor.email || null,
      role: params.actor.role || null,
    },
    createdAt,
  };

  await eventRef.set(eventRecord);

  const hooksSnap = await adminDb
    .collection(ZAPIER_HOOKS_COLLECTION)
    .where("tenantId", "==", params.tenantId)
    .where("eventName", "==", params.eventName)
    .where("status", "==", "active")
    .get();

  await Promise.all(
    hooksSnap.docs.map(async (hookDoc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const hook = hookDoc.data() || {};
      const hookRef = adminDb.collection(ZAPIER_HOOKS_COLLECTION).doc(hookDoc.id);

      try {
        await fetch(String(hook.targetUrl || ""), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Bizosto-Source": "zapier",
            "X-Bizosto-Event": params.eventName,
          },
          body: JSON.stringify({
            id: eventRef.id,
            eventName: params.eventName,
            entityType: params.entityType,
            entityId: params.entityId,
            tenantId: params.tenantId,
            createdAt,
            ...params.payload,
          }),
        });

        await hookRef.set(
          {
            lastTriggeredAt: createdAt,
            updatedAt: createdAt,
          },
          { merge: true }
        );
      } catch (error) {
        await hookRef.set(
          {
            lastError: String((error instanceof Error ? error.message : undefined) || "Webhook push failed"),
            updatedAt: createdAt,
          },
          { merge: true }
        );
      }
    })
  );

  return { eventId: eventRef.id, hooks: hooksSnap.size };
}

export async function executeZapierAction(params: {
  tenantId: string;
  action: string;
  input: Record<string, unknown>;
}) {
  const now = admin.firestore.FieldValue.serverTimestamp();

  switch (params.action) {
    case "create_invoice": {
      const ref = adminDb.collection("invoices").doc();
      const orderId = cleanString(params.input.orderId) || `ZAP-${Date.now()}`;
      const amountTotal = Number(params.input.amountTotal || 0);
      const status = cleanString(params.input.status || "draft").toLowerCase();
      const record = {
        tenantId: params.tenantId,
        orderId,
        clientId: cleanString(params.input.clientId),
        clientName: cleanString(params.input.clientName),
        amountTotal,
        amountTotalUsd: amountTotal,
        currency: cleanString(params.input.currency || "USD"),
        status,
        lineItems: Array.isArray(params.input.lineItems) ? params.input.lineItems : [],
        notes: cleanString(params.input.notes) || null,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      };
      await ref.set(record);
      return { id: ref.id, ...record };
    }
    case "create_client": {
      const ref = adminDb.collection("clients").doc();
      const email = cleanString(params.input.primaryContactEmail).toLowerCase();
      const record = {
        tenantId: params.tenantId,
        companyName: cleanString(params.input.companyName),
        primaryContactName: cleanString(params.input.primaryContactName),
        primaryContactEmail: email,
        primaryContactEmailLower: email,
        primaryContactPhone: cleanString(params.input.primaryContactPhone),
        salesOwner: cleanString(params.input.salesOwner),
        paymentStatus: "Unpaid",
        orderId: "",
        createdAt: now,
        updatedAt: now,
      };
      await ref.set(record);
      return { id: ref.id, ...record };
    }
    case "create_task": {
      const ref = adminDb.collection("tasks").doc();
      const record = {
        tenantId: params.tenantId,
        projectId: cleanString(params.input.projectId),
        title: cleanString(params.input.title),
        description: cleanString(params.input.description),
        status: cleanString(params.input.status || "todo"),
        priority: cleanString(params.input.priority || "medium"),
        assignedTo: cleanString(params.input.assignedTo) || null,
        createdAt: now,
        updatedAt: now,
      };
      await ref.set(record);
      return { id: ref.id, ...record };
    }
    case "create_project": {
      const ref = adminDb.collection("projects").doc();
      const record = {
        tenantId: params.tenantId,
        projectName: cleanString(params.input.projectName),
        clientId: cleanString(params.input.clientId),
        clientName: cleanString(params.input.clientName),
        stage: cleanString(params.input.stage || "Kickoff"),
        projectType: cleanString(params.input.projectType || "Other"),
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      };
      await ref.set(record);
      return { id: ref.id, ...record };
    }
    case "update_invoice_status": {
      const invoiceId = cleanString(params.input.invoiceId);
      if (!invoiceId) throw new Error("invoiceId is required.");
      const ref = adminDb.collection("invoices").doc(invoiceId);
      const snap = await ref.get();
      if (!snap.exists) throw new Error("Invoice not found.");
      const row = snap.data() || {};
      if (String(row.tenantId || "") !== params.tenantId) throw new Error("Forbidden");

      const status = cleanString(params.input.status || "draft").toLowerCase();
      await ref.set({ status, updatedAt: now }, { merge: true });
      return { id: invoiceId, status };
    }
    case "send_notification": {
      const ref = adminDb.collection("notifications").doc();
      const record = {
        tenantId: params.tenantId,
        title: cleanString(params.input.title),
        body: cleanString(params.input.body),
        toUserId: cleanString(params.input.toUserId) || null,
        toRole: cleanString(params.input.toRole) || null,
        type: cleanString(params.input.type || "info"),
        read: false,
        createdAt: now,
        updatedAt: now,
      };
      await ref.set(record);
      return { id: ref.id, ...record };
    }
    default:
      throw new Error("Unsupported action.");
  }
}

export async function executeZapierSearch(params: {
  tenantId: string;
  search: string;
  input: Record<string, unknown>;
}) {
  switch (params.search) {
    case "find_client_by_email": {
      const email = cleanString(params.input.email).toLowerCase();
      const snap = await adminDb
        .collection("clients")
        .where("tenantId", "==", params.tenantId)
        .where("primaryContactEmailLower", "==", email)
        .limit(1)
        .get();
      if (snap.empty) return null;
      const row = snap.docs[0];
      return { id: row.id, ...row.data() };
    }
    case "find_invoice_by_number": {
      const orderId = cleanString(params.input.orderId || params.input.invoiceNumber);
      const snap = await adminDb
        .collection("invoices")
        .where("tenantId", "==", params.tenantId)
        .where("orderId", "==", orderId)
        .limit(1)
        .get();
      if (snap.empty) return null;
      const row = snap.docs[0];
      return { id: row.id, ...row.data() };
    }
    case "find_project_by_name": {
      const name = cleanString(params.input.projectName).toLowerCase();
      const snap = await adminDb.collection("projects").where("tenantId", "==", params.tenantId).limit(50).get();
      const match = snap.docs.find((doc: FirebaseFirestore.QueryDocumentSnapshot) => cleanString(doc.data()?.projectName || doc.data()?.name).toLowerCase() === name);
      if (!match) return null;
      return { id: match.id, ...match.data() };
    }
    default:
      throw new Error("Unsupported search.");
  }
}
