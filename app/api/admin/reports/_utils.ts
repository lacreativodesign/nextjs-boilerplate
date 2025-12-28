import admin from "firebase-admin";
import { getCurrentUser, isAdminRole } from "../_utils";
import { computeHealth, getFinanceSettings, getWorkflowSettings } from "../settings/_utils";

export const runtime = "nodejs";

export const DEFAULT_REPORT_SETTINGS = {
  arAgingBucketsDays: [30, 60, 90],
  keyAccountUsdThreshold: 1000,
  atRiskAfterDays: 7,
  overdueAfterDays: 0,
  stageSlaDays: {
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
  const [workflowSettings, financeSettings] = await Promise.all([getWorkflowSettings(), getFinanceSettings()]);
  const buckets = Array.isArray(financeSettings.arBuckets) ? financeSettings.arBuckets : DEFAULT_REPORT_SETTINGS.arAgingBucketsDays;
  const stageSlaDays = workflowSettings.slaDaysPerStage || {};

  return {
    arAgingBucketsDays: buckets.map((value: any) => parseNumber(value, 0)).filter((value: number) => value > 0),
    keyAccountUsdThreshold: DEFAULT_REPORT_SETTINGS.keyAccountUsdThreshold,
    atRiskAfterDays: parseNumber(workflowSettings.atRiskAfterDays, DEFAULT_REPORT_SETTINGS.atRiskAfterDays),
    overdueAfterDays: parseNumber(workflowSettings.overdueAfterDays, DEFAULT_REPORT_SETTINGS.overdueAfterDays),
    stageSlaDays: { ...DEFAULT_REPORT_SETTINGS.stageSlaDays, ...stageSlaDays },
    projectStages: workflowSettings.projectStages || Object.keys(DEFAULT_REPORT_SETTINGS.stageSlaDays),
  };
}

export function normalizeStage(stage?: string) {
  const pipeline = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"];
  return pipeline.includes(stage || "") ? (stage as string) : "Kickoff";
}

export { computeHealth };
