import { createNotificationEvent } from "@/lib/notifications";

export type AuditActor = {
  uid?: string | null;
  name?: string | null;
};

export type AuditEventPayload = {
  tenantId?: string | null;
  type: string;
  title: string;
  description: string;
  entityType?: string | null;
  entityId?: string | null;
  actor?: AuditActor | null;
  metadata?: Record<string, unknown>;
};

export async function logEvent(payload: AuditEventPayload) {
  await createNotificationEvent({
    type: payload.type,
    title: payload.title,
    description: payload.description,
    entityType: payload.entityType || undefined,
    entityId: payload.entityId || undefined,
    createdByUid: payload.actor?.uid || null,
    createdByName: payload.actor?.name || null,
    metadata: payload.metadata,
    tenantId: payload.tenantId || null,
  });
}
