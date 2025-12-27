import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../_utils";

export const runtime = "nodejs";

export const DEFAULT_REPORT_SETTINGS = {
  arAgingBucketsDays: [30, 60, 90],
  keyAccountUsdThreshold: 1000,
  overdueWarningDays: 7,
  stageSlaDays: {
    Deposit: 2,
    Kickoff: 3,
    Draft: 5,
    Review: 5,
    Revisions: 7,
    Final: 3,
    Delivered: 0,
  },
};

export function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function toMillis(value: any): number | null {
  const iso = toISO(value);
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getStartOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
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

export async function getReportSettings() {
  const snap = await adminDb.collection("reportSettings").doc("global").get();
  const data = snap.exists ? snap.data() : {};
  const buckets = Array.isArray(data?.arAgingBucketsDays) ? data?.arAgingBucketsDays : DEFAULT_REPORT_SETTINGS.arAgingBucketsDays;
  const stageSlaDays = typeof data?.stageSlaDays === "object" && data?.stageSlaDays ? data.stageSlaDays : {};

  return {
    arAgingBucketsDays: buckets.map((value: any) => parseNumber(value, 0)).filter((value: number) => value > 0),
    keyAccountUsdThreshold: parseNumber(data?.keyAccountUsdThreshold, DEFAULT_REPORT_SETTINGS.keyAccountUsdThreshold),
    overdueWarningDays: parseNumber(data?.overdueWarningDays, DEFAULT_REPORT_SETTINGS.overdueWarningDays),
    stageSlaDays: { ...DEFAULT_REPORT_SETTINGS.stageSlaDays, ...stageSlaDays },
  };
}

export function normalizeStage(stage?: string) {
  const pipeline = ["Deposit", "Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"];
  return pipeline.includes(stage || "") ? (stage as string) : "Kickoff";
}

export function computeHealth(dueDate: string | null, overdueWarningDays: number) {
  if (!dueDate) return "On Track";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "On Track";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = due.getTime() - startOfToday.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Overdue";
  if (diffDays <= overdueWarningDays) return "At Risk";
  return "On Track";
}
