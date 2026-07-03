export const WEBHOOK_EVENT_TYPES = [
  'invoice.created',
  'invoice.updated',
  'invoice.paid',
  'client.created',
  'client.updated',
  'project.created',
  'project.completed',
  'task.created',
  'task.assigned',
  'task.completed',
  'payment.received',
  'user.created',
  'leave.requested',
  'leave.approved',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export type WebhookSubscriptionStatus = 'active' | 'disabled';

export type WebhookDeliveryStatus = 'pending' | 'retrying' | 'success' | 'failed';

export type WebhookSubscriptionRecord = {
  id: string;
  tenantId: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  status: WebhookSubscriptionStatus;
  description: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
};

export type WebhookEventEnvelope = {
  id: string;
  tenantId: string;
  event: WebhookEventType;
  entityType: string;
  entityId: string;
  occurredAt: string;
  source: 'api' | 'system';
  payload: Record<string, unknown>;
  actor: {
    uid: string;
    email?: string | null;
    role?: string | null;
  };
};

export type WebhookDeliveryRecord = {
  id: string;
  tenantId: string;
  subscriptionId: string;
  subscriptionUrl: string;
  eventId: string;
  eventType: WebhookEventType;
  status: WebhookDeliveryStatus;
  payload: WebhookEventEnvelope;
  signature: string;
  signatureTimestamp: string;
  retryCount: number;
  maxRetries: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  responseHeaders: Record<string, string>;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
};
