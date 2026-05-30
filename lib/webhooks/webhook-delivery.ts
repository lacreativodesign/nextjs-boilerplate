import crypto from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { dispatchZapierTriggerEvent } from "@/lib/zapier/service";
import { WEBHOOK_EVENT_TYPES, type WebhookDeliveryRecord, type WebhookEventEnvelope, type WebhookEventType, type WebhookSubscriptionRecord } from "./types";

const SUBSCRIPTIONS_COLLECTION = "webhook_subscriptions";
const EVENTS_COLLECTION = "webhook_events";
const DELIVERIES_COLLECTION = "webhook_deliveries";
const MAX_RETRIES = 5;
const DELIVERY_TIMEOUT_MS = 10000;

type Actor = {
  uid: string;
  role?: string | null;
  email?: string | null;
};

type CreateSubscriptionInput = {
  tenantId: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  status: "active" | "disabled";
  description?: string | null;
  actorUid: string;
};

type UpdateSubscriptionInput = {
  url?: string;
  events?: WebhookEventType[];
  secret?: string;
  status?: "active" | "disabled";
  description?: string | null;
  actorUid: string;
};

function nowIso() {
  return new Date().toISOString();
}

function sanitizeEvents(events: unknown): WebhookEventType[] {
  if (!Array.isArray(events)) return [];
  const allowed = new Set<WebhookEventType>(WEBHOOK_EVENT_TYPES);
  return Array.from(new Set(events.map((item) => String(item).trim()).filter((item): item is WebhookEventType => allowed.has(item as WebhookEventType))));
}

export function computeWebhookSignature(secret: string, timestamp: string, payload: string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

export function generateWebhookSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function toRecord<T>(id: string, data: FirebaseFirestore.DocumentData | undefined): T {
  return { id, ...(data || {}) } as T;
}

export async function createWebhookSubscription(input: CreateSubscriptionInput) {
  const timestamp = nowIso();
  const doc = adminDb.collection(SUBSCRIPTIONS_COLLECTION).doc();

  const record: Omit<WebhookSubscriptionRecord, "id"> = {
    tenantId: input.tenantId,
    url: input.url,
    events: sanitizeEvents(input.events),
    secret: input.secret,
    status: input.status,
    description: input.description?.trim() || null,
    createdBy: input.actorUid,
    updatedBy: input.actorUid,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastDeliveryAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
  };

  await doc.set(record);
  return { id: doc.id, ...record } satisfies WebhookSubscriptionRecord;
}

export async function listWebhookSubscriptions(tenantId: string) {
  const snap = await adminDb.collection(SUBSCRIPTIONS_COLLECTION).where("tenantId", "==", tenantId).orderBy("createdAt", "desc").get();
  return snap.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => toRecord<WebhookSubscriptionRecord>(doc.id, doc.data()));
}

export async function updateWebhookSubscription(id: string, tenantId: string, input: UpdateSubscriptionInput) {
  const ref = adminDb.collection(SUBSCRIPTIONS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const current = snap.data();
  if (!current || current.tenantId !== tenantId) return null;

  const patch: Partial<WebhookSubscriptionRecord> = {
    updatedAt: nowIso(),
    updatedBy: input.actorUid,
  };

  if (typeof input.url === "string") patch.url = input.url;
  if (Array.isArray(input.events)) patch.events = sanitizeEvents(input.events);
  if (typeof input.secret === "string") patch.secret = input.secret;
  if (input.status === "active" || input.status === "disabled") patch.status = input.status;
  if (input.description !== undefined) patch.description = input.description?.trim() || null;

  await ref.set(patch, { merge: true });
  const updated = await ref.get();
  return toRecord<WebhookSubscriptionRecord>(updated.id, updated.data());
}

export async function deleteWebhookSubscription(id: string, tenantId: string) {
  const ref = adminDb.collection(SUBSCRIPTIONS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  if ((snap.data()?.tenantId as string) !== tenantId) return false;
  await ref.delete();
  return true;
}

function nextRetryAt(retryCount: number) {
  const backoffMs = Math.min(2 ** retryCount * 1000, 5 * 60 * 1000);
  return new Date(Date.now() + backoffMs).toISOString();
}

async function updateSubscriptionHealth(subscriptionId: string, status: "success" | "failed") {
  const ref = adminDb.collection(SUBSCRIPTIONS_COLLECTION).doc(subscriptionId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  const now = nowIso();

  if (status === "success") {
    await ref.set(
      {
        lastDeliveryAt: now,
        lastSuccessAt: now,
        consecutiveFailures: 0,
        updatedAt: now,
      },
      { merge: true }
    );
    return;
  }

  await ref.set(
    {
      lastDeliveryAt: now,
      lastFailureAt: now,
      consecutiveFailures: Number(data.consecutiveFailures || 0) + 1,
      updatedAt: now,
    },
    { merge: true }
  );
}

async function attemptDelivery(delivery: WebhookDeliveryRecord, subscriptionSecret: string) {
  const attemptAt = nowIso();
  const payloadString = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = computeWebhookSignature(subscriptionSecret, timestamp, payloadString);
  const started = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(delivery.subscriptionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Bizosto-ERP-Webhooks/1.0",
        "X-Bizosto-Event": delivery.eventType,
        "X-Bizosto-Delivery": delivery.id,
        "X-Bizosto-Timestamp": timestamp,
        "X-Bizosto-Signature": `sha256=${signature}`,
      },
      body: payloadString,
      signal: controller.signal,
    });

    const responseBody = await response.text();
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const durationMs = Date.now() - started;

    return {
      ok: response.ok,
      statusCode: response.status,
      responseBody: responseBody.slice(0, 5000),
      responseHeaders,
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
      durationMs,
      signature,
      signatureTimestamp: timestamp,
      attemptAt,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      responseBody: null,
      responseHeaders: {},
      errorMessage: (error as Record<string, unknown>)?.name === "AbortError" ? "Request timeout" : String((error instanceof Error ? error.message : undefined) || "Delivery failed"),
      durationMs: Date.now() - started,
      signature,
      signatureTimestamp: timestamp,
      attemptAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function executeDelivery(deliveryId: string) {
  const ref = adminDb.collection(DELIVERIES_COLLECTION).doc(deliveryId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const delivery = toRecord<WebhookDeliveryRecord>(snap.id, snap.data());

  if (delivery.status === "success") return delivery;

  const subscriptionRef = adminDb.collection(SUBSCRIPTIONS_COLLECTION).doc(delivery.subscriptionId);
  const subscriptionSnap = await subscriptionRef.get();
  if (!subscriptionSnap.exists) {
    await ref.set(
      {
        status: "failed",
        errorMessage: "Subscription not found",
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    return null;
  }

  const subscription = toRecord<WebhookSubscriptionRecord>(subscriptionSnap.id, subscriptionSnap.data());

  const result = await attemptDelivery(delivery, subscription.secret);
  const retryCount = Number(delivery.retryCount || 0);

  if (result.ok) {
    await ref.set(
      {
        status: "success",
        retryCount,
        nextAttemptAt: null,
        lastAttemptAt: result.attemptAt,
        responseStatus: result.statusCode,
        responseBody: result.responseBody,
        responseHeaders: result.responseHeaders,
        errorMessage: null,
        durationMs: result.durationMs,
        signature: result.signature,
        signatureTimestamp: result.signatureTimestamp,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    await updateSubscriptionHealth(subscription.id, "success");
    return { ...delivery, status: "success" as const };
  }

  const hasRetries = retryCount < MAX_RETRIES;
  await ref.set(
    {
      status: hasRetries ? "retrying" : "failed",
      retryCount: retryCount + 1,
      nextAttemptAt: hasRetries ? nextRetryAt(retryCount + 1) : null,
      lastAttemptAt: result.attemptAt,
      responseStatus: result.statusCode,
      responseBody: result.responseBody,
      responseHeaders: result.responseHeaders,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
      signature: result.signature,
      signatureTimestamp: result.signatureTimestamp,
      updatedAt: nowIso(),
    },
    { merge: true }
  );

  await updateSubscriptionHealth(subscription.id, "failed");
  return { ...delivery, status: hasRetries ? "retrying" : "failed" as const };
}

export async function dispatchWebhookEvent(params: {
  tenantId: string;
  event: WebhookEventType;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  actor: Actor;
  source?: "api" | "system";
}) {
  const occurredAt = nowIso();
  const eventRef = adminDb.collection(EVENTS_COLLECTION).doc();
  const envelope: WebhookEventEnvelope = {
    id: eventRef.id,
    tenantId: params.tenantId,
    event: params.event,
    entityType: params.entityType,
    entityId: params.entityId,
    occurredAt,
    source: params.source || "api",
    payload: params.payload,
    actor: {
      uid: params.actor.uid,
      role: params.actor.role || null,
      email: params.actor.email || null,
    },
  };

  await eventRef.set(envelope);

  const zapierEligibleEvents = new Set(["invoice.created", "invoice.paid", "client.created", "payment.received", "leave.requested"]);
  if (zapierEligibleEvents.has(params.event)) {
    try {
      await dispatchZapierTriggerEvent({
        tenantId: params.tenantId,
        eventName: params.event,
        entityType: params.entityType,
        entityId: params.entityId,
        payload: params.payload,
        actor: params.actor,
      });
    } catch (error) {
      console.error("zapier dispatch error", error);
    }
  }

  const subSnap = await adminDb
    .collection(SUBSCRIPTIONS_COLLECTION)
    .where("tenantId", "==", params.tenantId)
    .where("status", "==", "active")
    .where("events", "array-contains", params.event)
    .get();

  const deliveries: WebhookDeliveryRecord[] = [];

  for (const doc of subSnap.docs) {
    const subscription = toRecord<WebhookSubscriptionRecord>(doc.id, doc.data());
    const deliveryRef = adminDb.collection(DELIVERIES_COLLECTION).doc();
    const delivery: WebhookDeliveryRecord = {
      id: deliveryRef.id,
      tenantId: params.tenantId,
      subscriptionId: subscription.id,
      subscriptionUrl: subscription.url,
      eventId: envelope.id,
      eventType: params.event,
      status: "pending",
      payload: envelope,
      signature: "",
      signatureTimestamp: "",
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      nextAttemptAt: nowIso(),
      lastAttemptAt: null,
      responseStatus: null,
      responseBody: null,
      responseHeaders: {},
      errorMessage: null,
      durationMs: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await deliveryRef.set(delivery);
    deliveries.push(delivery);
  }

  await Promise.all(deliveries.map((delivery) => executeDelivery(delivery.id)));

  return {
    eventId: envelope.id,
    deliveriesCreated: deliveries.length,
  };
}

export async function processPendingWebhookDeliveries(limit = 50) {
  const now = nowIso();
  const snap = await adminDb
    .collection(DELIVERIES_COLLECTION)
    .where("status", "in", ["pending", "retrying"])
    .where("nextAttemptAt", "<=", now)
    .orderBy("nextAttemptAt", "asc")
    .limit(limit)
    .get();

  let processed = 0;
  for (const doc of snap.docs) {
    await executeDelivery(doc.id);
    processed += 1;
  }

  return { processed };
}

export async function retryWebhookDeliveryManually(deliveryId: string, tenantId: string) {
  const ref = adminDb.collection(DELIVERIES_COLLECTION).doc(deliveryId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  if ((data?.tenantId as string) !== tenantId) return null;

  await ref.set(
    {
      status: "retrying",
      nextAttemptAt: nowIso(),
      updatedAt: nowIso(),
    },
    { merge: true }
  );

  await executeDelivery(deliveryId);
  const updated = await ref.get();
  return toRecord<WebhookDeliveryRecord>(updated.id, updated.data());
}

export async function listWebhookDeliveries(tenantId: string, limit = 100) {
  let deliveries: WebhookDeliveryRecord[] = [];

  try {
    const snap = await adminDb
      .collection(DELIVERIES_COLLECTION)
      .where("tenantId", "==", tenantId)
      .orderBy("createdAt", "desc")
      .limit(Math.min(limit, 200))
      .get();

    deliveries = snap.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => toRecord<WebhookDeliveryRecord>(doc.id, doc.data()));
  } catch {
    deliveries = [];
  }

  return deliveries;
}

export function computeWebhookHealth(subscriptions: WebhookSubscriptionRecord[]) {
  return subscriptions.map((sub) => ({
    subscriptionId: sub.id,
    url: sub.url,
    status: sub.status,
    healthy: sub.status === "active" && sub.consecutiveFailures < 3,
    consecutiveFailures: sub.consecutiveFailures,
    lastSuccessAt: sub.lastSuccessAt,
    lastFailureAt: sub.lastFailureAt,
  }));
}
