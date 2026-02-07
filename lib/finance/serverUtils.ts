import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

export function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function parseNumber(value: any, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

export function parseString(value: any, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

export async function createFinanceEvent({
  type,
  title,
  description,
  entityType,
  entityId,
  createdByUid,
  createdByName,
  metadata,
  tenantId,
}: {
  type: string;
  title: string;
  description: string;
  entityType?: string;
  entityId?: string;
  createdByUid?: string;
  createdByName?: string;
  metadata?: Record<string, unknown>;
  tenantId?: string | null;
}) {
  await adminDb.collection("events").add({
    type,
    title,
    description,
    entityType: entityType || null,
    entityId: entityId || null,
    metadata: metadata || {},
    createdByUid: createdByUid || null,
    createdByName: createdByName || null,
    tenantId: tenantId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function queueFinanceEmail({
  to,
  template,
  subject,
  data,
  metadata,
  tenantId,
}: {
  to: string;
  template: string;
  subject: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tenantId?: string | null;
}) {
  await adminDb.collection("emails").add({
    to,
    template,
    subject,
    data: data || {},
    metadata: metadata || {},
    status: "pending",
    tenantId: tenantId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
