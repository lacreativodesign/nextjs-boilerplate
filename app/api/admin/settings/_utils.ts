import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole, isSuperAdmin } from "../_utils";

export const runtime = "nodejs";

export const WORKFLOW_STAGES = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"] as const;
export const SALES_PIPELINE_STAGES = [
  "New Lead",
  "Contacted",
  "Qualified",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
] as const;

export const DEFAULT_WORKFLOW_SETTINGS = {
  projectStages: [...WORKFLOW_STAGES],
  slaDaysPerStage: {
    Kickoff: 3,
    Draft: 5,
    Review: 5,
    Revisions: 7,
    Final: 3,
    Delivered: 0,
  },
  atRiskAfterDays: 7,
  overdueAfterDays: 0,
};

export const DEFAULT_FINANCE_SETTINGS = {
  invoicePrefix: "",
  invoiceCounter: 0,
  paymentMethods: [] as string[],
  arBuckets: [30, 60, 90],
  payrollApprovalRequired: false,
  lockPastMonths: false,
};

export const DEFAULT_SYSTEM_SETTINGS = {
  companyName: "",
  timezone: "",
  dateFormat: "",
  workingDays: [] as string[],
  workingHours: { start: "", end: "" },
  revenueCurrency: "USD",
  expenseCurrency: "PKR",
  fiscalMonthStart: 1,
};

export const DEFAULT_NOTIFICATIONS_SETTINGS = {
  enableInApp: true,
  enableEmail: false,
  senderName: "",
  replyToEmail: "",
  eventToggles: {} as Record<string, boolean>,
};

export const DEFAULT_SECURITY_SETTINGS = {
  sessionTimeoutMinutes: 60,
  passwordPolicy: "Minimum 8 characters, 1 uppercase letter, 1 number.",
  activityRetentionDays: 90,
  forceLogoutAll: false,
};

export function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

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

export function parseBoolean(value: any, fallback = false) {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

export function parseStringArray(value: any) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0);
}

export function parseNumberArray(value: any, fallback: number[] = []) {
  if (!Array.isArray(value)) return fallback;
  const parsed = value.map((item) => parseNumber(item, 0)).filter((item) => item > 0);
  return parsed.length ? parsed : fallback;
}

export async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (!isAdminRole(me.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user: me };
}

export function canEditSection(role: string, section: string) {
  if (isSuperAdmin(role)) return true;
  if (role.toLowerCase() === "admin") {
    return ["system", "workflows", "sales", "finance", "notifications"].includes(section);
  }
  return false;
}

export async function getWorkflowSettings() {
  const snap = await adminDb.collection("settings").doc("workflows").get();
  const data = snap.exists ? snap.data() : {};
  const slaDaysPerStage =
    typeof data?.slaDaysPerStage === "object" && data?.slaDaysPerStage
      ? Object.fromEntries(Object.entries(data.slaDaysPerStage).map(([key, value]) => [key, parseNumber(value, 0)]))
      : {};

  return {
    projectStages: DEFAULT_WORKFLOW_SETTINGS.projectStages,
    slaDaysPerStage: { ...DEFAULT_WORKFLOW_SETTINGS.slaDaysPerStage, ...slaDaysPerStage },
    atRiskAfterDays: parseNumber(data?.atRiskAfterDays, DEFAULT_WORKFLOW_SETTINGS.atRiskAfterDays),
    overdueAfterDays: parseNumber(data?.overdueAfterDays, DEFAULT_WORKFLOW_SETTINGS.overdueAfterDays),
    updatedAt: toISO(data?.updatedAt),
    updatedBy: data?.updatedBy || null,
  };
}

export async function getFinanceSettings() {
  const snap = await adminDb.collection("settings").doc("finance").get();
  const data = snap.exists ? snap.data() : {};
  return {
    invoicePrefix: parseString(data?.invoicePrefix, DEFAULT_FINANCE_SETTINGS.invoicePrefix),
    invoiceCounter: parseNumber(data?.invoiceCounter, DEFAULT_FINANCE_SETTINGS.invoiceCounter),
    paymentMethods: parseStringArray(data?.paymentMethods),
    arBuckets: parseNumberArray(data?.arBuckets, DEFAULT_FINANCE_SETTINGS.arBuckets),
    payrollApprovalRequired: parseBoolean(data?.payrollApprovalRequired, DEFAULT_FINANCE_SETTINGS.payrollApprovalRequired),
    lockPastMonths: parseBoolean(data?.lockPastMonths, DEFAULT_FINANCE_SETTINGS.lockPastMonths),
    updatedAt: toISO(data?.updatedAt),
    updatedBy: data?.updatedBy || null,
  };
}

export async function getNotificationSettings() {
  const snap = await adminDb.collection("settings").doc("notifications").get();
  const data = snap.exists ? snap.data() : {};
  const eventToggles =
    typeof data?.eventToggles === "object" && data?.eventToggles
      ? Object.fromEntries(Object.entries(data.eventToggles).map(([key, value]) => [key, Boolean(value)]))
      : {};
  return {
    enableInApp: parseBoolean(data?.enableInApp, DEFAULT_NOTIFICATIONS_SETTINGS.enableInApp),
    enableEmail: parseBoolean(data?.enableEmail, DEFAULT_NOTIFICATIONS_SETTINGS.enableEmail),
    senderName: parseString(data?.senderName, DEFAULT_NOTIFICATIONS_SETTINGS.senderName),
    replyToEmail: parseString(data?.replyToEmail, DEFAULT_NOTIFICATIONS_SETTINGS.replyToEmail),
    eventToggles,
  };
}

export function computeHealth(dueDate: string | null, atRiskAfterDays: number, overdueAfterDays: number) {
  if (!dueDate) return "On Track" as const;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "On Track" as const;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = due.getTime() - startOfToday.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -Math.max(overdueAfterDays, 0)) return "Overdue" as const;
  if (diffDays <= Math.max(atRiskAfterDays, 0)) return "At Risk" as const;
  return "On Track" as const;
}

export async function logSettingsChange({
  user,
  section,
  summary,
  notificationsEnabled,
}: {
  user: { uid: string; role: string; name?: string; email?: string };
  section: string;
  summary: string;
  notificationsEnabled?: boolean;
}) {
  await adminDb.collection("admin_activity").add({
    action: "settings.update",
    section,
    summary,
    performedBy: user.uid,
    performedByRole: user.role,
    timestamp: new Date().toISOString(),
  });

  await adminDb.collection("events").add({
    type: "settings.update",
    title: `Settings updated: ${section}`,
    description: summary,
    entityType: "settings",
    entityId: section,
    metadata: { section },
    createdByUid: user.uid,
    createdByName: user.name || user.email || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const notifications =
    typeof notificationsEnabled === "boolean" ? notificationsEnabled : (await getNotificationSettings()).enableInApp;

  if (notifications) {
    await adminDb.collection("notifications").add({
      title: "System settings updated",
      body: summary,
      userId: user.uid,
      metadata: { section },
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}
