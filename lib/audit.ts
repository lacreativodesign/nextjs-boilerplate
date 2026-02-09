import { createNotificationEvent } from "@/lib/notifications";
import { adminDb } from "@/lib/firebaseAdmin";
import { AuditLogger } from "@/lib/audit/audit-logger";
import type { AuditAction, AuditResource } from "@/types/audit";

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
  audit?: {
    action?: AuditAction;
    resource?: AuditResource;
    resourceId?: string;
    changes?: Array<{
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }>;
    status?: "success" | "failure";
    errorMessage?: string;
    metadata?: {
      ip?: string;
      userAgent?: string;
      location?: string;
      sessionId?: string;
    };
    userEmail?: string;
    userName?: string;
  };
};

const RESOURCE_MAP: Record<string, AuditResource> = {
  user: "user",
  tenant: "tenant",
  role: "role",
  permission: "permission",
  invoice: "invoice",
  customer: "customer",
  client: "customer",
  product: "product",
  order: "order",
  payment: "payment",
  expense: "expense",
  report: "report",
  settings: "settings",
  integration: "integration",
  project: "project",
  deal: "deal",
  lead: "lead",
  payroll: "payroll",
  change_request: "change_request",
  approval: "approval",
  file: "file",
  event: "event",
  notification: "notification",
  email: "email",
  attendance: "attendance",
};

function normalizeResource(entityType?: string | null): AuditResource {
  const key = String(entityType || "").toLowerCase();
  return RESOURCE_MAP[key] || "settings";
}

function inferAction(eventType: string): AuditAction {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("login_failed") || normalized.includes("failed_login")) return "login_failed";
  if (normalized.includes("logout")) return "logout";
  if (normalized.includes("login")) return "login";
  if (normalized.includes("mfa_enabled")) return "mfa_enabled";
  if (normalized.includes("mfa_disabled")) return "mfa_disabled";
  if (normalized.includes("password_changed")) return "password_changed";
  if (normalized.includes("export")) return "export";
  if (normalized.includes("import")) return "import";
  if (normalized.includes("bulk_delete")) return "bulk_delete";
  if (normalized.includes("bulk_update")) return "bulk_update";
  if (normalized.includes("role_change")) return "role_changed";
  if (normalized.includes("permission_change")) return "permission_changed";
  if (normalized.includes("settings")) return "settings_changed";
  if (normalized.includes("delete") || normalized.includes("removed") || normalized.includes("archive")) return "delete";
  if (normalized.includes("create") || normalized.includes("created") || normalized.includes("new")) return "create";
  if (normalized.includes("read") || normalized.includes("view")) return "read";
  if (normalized.includes("update") || normalized.includes("updated") || normalized.includes("change")) return "update";
  return "update";
}

async function resolveUserDetails(userId?: string | null, fallbackName?: string | null) {
  if (!userId) {
    return { userEmail: "", userName: fallbackName || "" };
  }
  try {
    const snap = await adminDb.collection("users").doc(userId).get();
    if (!snap.exists) {
      return { userEmail: "", userName: fallbackName || "" };
    }
    const data = snap.data() || {};
    return {
      userEmail: String(data.email || ""),
      userName: String(data.name || data.fullName || fallbackName || ""),
      tenantId: String(data.tenantId || ""),
    };
  } catch (error) {
    console.error("audit user lookup error:", error);
    return { userEmail: "", userName: fallbackName || "" };
  }
}

export async function logEvent(payload: AuditEventPayload) {
  try {
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
  } catch (error) {
    console.error("notification event error:", error);
  }

  try {
    const actorId = payload.actor?.uid || "";
    const resolved = await resolveUserDetails(actorId, payload.actor?.name || "");
    const resource = payload.audit?.resource || normalizeResource(payload.entityType);
    const action = payload.audit?.action || inferAction(payload.type);
    const tenantId = String(payload.tenantId || resolved.tenantId || "");

    if (!tenantId) return;

    const metadata = {
      ...(payload.audit?.metadata || {}),
    } as {
      ip?: string;
      userAgent?: string;
      location?: string;
      sessionId?: string;
    };
    if (payload.metadata && typeof payload.metadata === "object") {
      const meta = payload.metadata as Record<string, unknown>;
      if (typeof meta.ip === "string") metadata.ip = meta.ip;
      if (typeof meta.userAgent === "string") metadata.userAgent = meta.userAgent;
      if (typeof meta.location === "string") metadata.location = meta.location;
      if (typeof meta.sessionId === "string") metadata.sessionId = meta.sessionId;
    }

    await AuditLogger.log({
      tenantId,
      userId: actorId || "unknown",
      userEmail: payload.audit?.userEmail || resolved.userEmail || "",
      userName: payload.audit?.userName || resolved.userName || payload.actor?.name || "",
      action,
      resource,
      resourceId: payload.audit?.resourceId || payload.entityId || undefined,
      changes: payload.audit?.changes,
      metadata,
      status: payload.audit?.status || "success",
      errorMessage: payload.audit?.errorMessage,
    });
  } catch (error) {
    console.error("audit log error:", error);
  }
}
