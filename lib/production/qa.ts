import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

export type DefectType = "bug" | "enhancement" | "task";
export type DefectSeverity = "critical" | "high" | "medium" | "low";
export type DefectStatus = "open" | "in_progress" | "resolved" | "closed" | "reopened";

export type DefectRecord = {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  type: DefectType;
  severity: DefectSeverity;
  status: DefectStatus;
  priorityScore: number;
  priorityLabel: "P0" | "P1" | "P2" | "P3";
  slaHours: number;
  slaDueAt: string | null;
  reportedByUid: string;
  reportedByName: string;
  assignedToUid: string | null;
  requirementId: string | null;
  rootCauseCategory: string | null;
  rootCauseNotes: string | null;
  reopenedCount: number;
  escapedToProduction: boolean;
  testCaseIds: string[];
  defectAgingDays: number;
  createdAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
};

export type TestCaseRecord = {
  id: string;
  tenantId: string;
  title: string;
  requirementId: string;
  description: string;
  steps: string[];
  expectedResult: string;
  status: "draft" | "active" | "deprecated";
  createdByUid: string;
  createdByName: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TestRunRecord = {
  id: string;
  tenantId: string;
  testCaseId: string;
  requirementId: string;
  status: "passed" | "failed" | "blocked";
  defectsLinked: string[];
  notes: string;
  executedByUid: string;
  executedByName: string;
  executedAt: string | null;
};

export type QualityMetrics = {
  totalDefects: number;
  openDefects: number;
  resolvedDefects: number;
  escapedDefects: number;
  defectDensity: number;
  defectEscapeRate: number;
  meanAgingDays: number;
  slaBreachedCount: number;
};

export type DefectListFilters = {
  severity?: DefectSeverity;
  status?: DefectStatus;
};

const severityWeight: Record<DefectSeverity, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
};

const typeWeight: Record<DefectType, number> = {
  bug: 30,
  enhancement: 15,
  task: 10,
};

const severitySlaHours: Record<DefectSeverity, number> = {
  critical: 24,
  high: 72,
  medium: 168,
  low: 336,
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as unknown).toDate === "function") return (value as { toDate: () => Date }).toDate().toISOString();
  return null;
}

function parseIso(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function calculateDefectAgingDays(createdAtIso: string | null, terminalAtIso?: string | null) {
  const createdAt = parseIso(createdAtIso);
  if (!createdAt) return 0;
  const endDate = parseIso(terminalAtIso || null) || new Date();
  const diffMs = Math.max(0, endDate.getTime() - createdAt.getTime());
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function calculatePriority({
  severity,
  type,
  agingDays,
  reopenedCount,
}: {
  severity: DefectSeverity;
  type: DefectType;
  agingDays: number;
  reopenedCount: number;
}) {
  const score = severityWeight[severity] + typeWeight[type] + Math.min(40, agingDays * 2) + Math.min(20, reopenedCount * 5);
  const priorityLabel: DefectRecord["priorityLabel"] = score >= 140 ? "P0" : score >= 110 ? "P1" : score >= 80 ? "P2" : "P3";
  return {
    score,
    priorityLabel,
  };
}

export function calculateSlaDueAt(severity: DefectSeverity, createdAt: Date) {
  return new Date(createdAt.getTime() + severitySlaHours[severity] * 60 * 60 * 1000);
}

function hydrateDefect(id: string, data: FirebaseFirestore.DocumentData): DefectRecord {
  const createdAtIso = toIso(data.createdAt);
  const resolvedAtIso = toIso(data.resolvedAt);
  const closedAtIso = toIso(data.closedAt);
  const status = (data.status || "open") as DefectStatus;
  const agingDays = calculateDefectAgingDays(createdAtIso, status === "closed" ? closedAtIso : resolvedAtIso);
  const priority = calculatePriority({
    severity: data.severity,
    type: data.type,
    agingDays,
    reopenedCount: Number(data.reopenedCount || 0),
  });

  return {
    id,
    tenantId: String(data.tenantId || ""),
    title: String(data.title || ""),
    description: String(data.description || ""),
    type: data.type as DefectType,
    severity: data.severity as DefectSeverity,
    status,
    priorityScore: priority.score,
    priorityLabel: priority.priorityLabel,
    slaHours: Number(data.slaHours || severitySlaHours[data.severity as DefectSeverity] || 168),
    slaDueAt: toIso(data.slaDueAt),
    reportedByUid: String(data.reportedByUid || ""),
    reportedByName: String(data.reportedByName || ""),
    assignedToUid: data.assignedToUid ? String(data.assignedToUid) : null,
    requirementId: data.requirementId ? String(data.requirementId) : null,
    rootCauseCategory: data.rootCauseCategory ? String(data.rootCauseCategory) : null,
    rootCauseNotes: data.rootCauseNotes ? String(data.rootCauseNotes) : null,
    reopenedCount: Number(data.reopenedCount || 0),
    escapedToProduction: Boolean(data.escapedToProduction),
    testCaseIds: Array.isArray(data.testCaseIds) ? data.testCaseIds.map((x: unknown) => String(x)) : [],
    defectAgingDays: agingDays,
    createdAt: createdAtIso,
    updatedAt: toIso(data.updatedAt),
    resolvedAt: resolvedAtIso,
    closedAt: closedAtIso,
  };
}

export async function createDefect(
  tenantId: string,
  actor: { uid: string; name: string },
  payload: {
    title: string;
    description: string;
    type: DefectType;
    severity: DefectSeverity;
    assignedToUid?: string | null;
    requirementId?: string | null;
    escapedToProduction?: boolean;
    testCaseIds?: string[];
  }
) {
  const now = new Date();
  const priority = calculatePriority({ severity: payload.severity, type: payload.type, agingDays: 0, reopenedCount: 0 });
  const ref = adminDb.collection("productionDefects").doc();

  await ref.set({
    tenantId,
    title: payload.title,
    description: payload.description,
    type: payload.type,
    severity: payload.severity,
    status: "open",
    priorityScore: priority.score,
    priorityLabel: priority.priorityLabel,
    slaHours: severitySlaHours[payload.severity],
    slaDueAt: admin.firestore.Timestamp.fromDate(calculateSlaDueAt(payload.severity, now)),
    reportedByUid: actor.uid,
    reportedByName: actor.name,
    assignedToUid: payload.assignedToUid || null,
    requirementId: payload.requirementId || null,
    rootCauseCategory: null,
    rootCauseNotes: null,
    reopenedCount: 0,
    escapedToProduction: Boolean(payload.escapedToProduction),
    testCaseIds: payload.testCaseIds || [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lifecycleHistory: [
      {
        status: "open",
        changedAt: admin.firestore.FieldValue.serverTimestamp(),
        changedByUid: actor.uid,
        changedByName: actor.name,
      },
    ],
  });

  const created = await ref.get();
  return hydrateDefect(created.id, created.data() || {});
}

export async function listDefects(tenantId: string, filters: DefectListFilters = {}) {
  let query: FirebaseFirestore.Query = adminDb.collection("productionDefects").where("tenantId", "==", tenantId);
  if (filters.severity) query = query.where("severity", "==", filters.severity);
  if (filters.status) query = query.where("status", "==", filters.status);

  const snapshot = await query.orderBy("createdAt", "desc").limit(500).get();
  return snapshot.docs.map((doc) => hydrateDefect(doc.id, doc.data()));
}

export async function updateDefect(
  tenantId: string,
  defectId: string,
  actor: { uid: string; name: string },
  payload: {
    status?: DefectStatus;
    severity?: DefectSeverity;
    assignedToUid?: string | null;
    rootCauseCategory?: string | null;
    rootCauseNotes?: string | null;
    escapedToProduction?: boolean;
  }
) {
  const ref = adminDb.collection("productionDefects").doc(defectId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Defect not found");
  }

  const current = snap.data() || {};
  if (current.tenantId !== tenantId) {
    throw new Error("Forbidden");
  }

  const nextStatus = (payload.status || current.status) as DefectStatus;
  const nextSeverity = (payload.severity || current.severity) as DefectSeverity;
  const reopenedCount = nextStatus === "reopened" ? Number(current.reopenedCount || 0) + 1 : Number(current.reopenedCount || 0);
  const createdAt = toIso(current.createdAt);
  const agingDays = calculateDefectAgingDays(createdAt);
  const priority = calculatePriority({
    severity: nextSeverity,
    type: current.type,
    agingDays,
    reopenedCount,
  });

  const updates: Record<string, unknown> = {
    status: nextStatus,
    severity: nextSeverity,
    assignedToUid: payload.assignedToUid === undefined ? (current.assignedToUid || null) : payload.assignedToUid,
    rootCauseCategory: payload.rootCauseCategory === undefined ? (current.rootCauseCategory || null) : payload.rootCauseCategory,
    rootCauseNotes: payload.rootCauseNotes === undefined ? (current.rootCauseNotes || null) : payload.rootCauseNotes,
    escapedToProduction:
      payload.escapedToProduction === undefined ? Boolean(current.escapedToProduction) : Boolean(payload.escapedToProduction),
    reopenedCount,
    priorityScore: priority.score,
    priorityLabel: priority.priorityLabel,
    slaHours: severitySlaHours[nextSeverity],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lifecycleHistory: admin.firestore.FieldValue.arrayUnion({
      status: nextStatus,
      changedAt: admin.firestore.FieldValue.serverTimestamp(),
      changedByUid: actor.uid,
      changedByName: actor.name,
    }),
  };

  if (nextStatus === "resolved") updates.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
  if (nextStatus === "closed") updates.closedAt = admin.firestore.FieldValue.serverTimestamp();

  await ref.set(updates, { merge: true });

  const updated = await ref.get();
  return hydrateDefect(updated.id, updated.data() || {});
}

export async function createTestCase(
  tenantId: string,
  actor: { uid: string; name: string },
  payload: {
    title: string;
    requirementId: string;
    description: string;
    steps: string[];
    expectedResult: string;
  }
) {
  const ref = adminDb.collection("productionTestCases").doc();
  await ref.set({
    tenantId,
    title: payload.title,
    requirementId: payload.requirementId,
    description: payload.description,
    steps: payload.steps,
    expectedResult: payload.expectedResult,
    status: "active",
    createdByUid: actor.uid,
    createdByName: actor.name,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return {
    id: snap.id,
    ...(snap.data() as Omit<TestCaseRecord, "id" | "createdAt" | "updatedAt">),
    createdAt: toIso(snap.data()?.createdAt),
    updatedAt: toIso(snap.data()?.updatedAt),
  } satisfies TestCaseRecord;
}

export async function listTestCases(tenantId: string) {
  const snap = await adminDb
    .collection("productionTestCases")
    .where("tenantId", "==", tenantId)
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<TestCaseRecord, "id" | "createdAt" | "updatedAt">),
    createdAt: toIso(doc.data().createdAt),
    updatedAt: toIso(doc.data().updatedAt),
  })) as TestCaseRecord[];
}

export async function executeTestRun(
  tenantId: string,
  actor: { uid: string; name: string },
  payload: {
    testCaseId: string;
    status: "passed" | "failed" | "blocked";
    defectsLinked?: string[];
    notes?: string;
  }
) {
  const caseDoc = await adminDb.collection("productionTestCases").doc(payload.testCaseId).get();
  if (!caseDoc.exists) {
    throw new Error("Test case not found");
  }

  const testCase = caseDoc.data() || {};
  if (testCase.tenantId !== tenantId) {
    throw new Error("Forbidden");
  }

  const ref = adminDb.collection("productionTestRuns").doc();
  await ref.set({
    tenantId,
    testCaseId: payload.testCaseId,
    requirementId: String(testCase.requirementId || ""),
    status: payload.status,
    defectsLinked: payload.defectsLinked || [],
    notes: payload.notes || "",
    executedByUid: actor.uid,
    executedByName: actor.name,
    executedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return {
    id: snap.id,
    ...(snap.data() as Omit<TestRunRecord, "id" | "executedAt">),
    executedAt: toIso(snap.data()?.executedAt),
  } satisfies TestRunRecord;
}

export function buildQualityMetrics(defects: DefectRecord[], testRunsCount: number): QualityMetrics {
  const totalDefects = defects.length;
  const openDefects = defects.filter((defect) => ["open", "in_progress", "reopened"].includes(defect.status)).length;
  const resolvedDefects = defects.filter((defect) => ["resolved", "closed"].includes(defect.status)).length;
  const escapedDefects = defects.filter((defect) => defect.escapedToProduction).length;
  const totalAgingDays = defects.reduce((sum, defect) => sum + defect.defectAgingDays, 0);
  const now = Date.now();
  const slaBreachedCount = defects.filter((defect) => {
    if (!defect.slaDueAt) return false;
    const due = new Date(defect.slaDueAt).getTime();
    if (Number.isNaN(due)) return false;
    return ["resolved", "closed"].includes(defect.status) ? false : due < now;
  }).length;

  return {
    totalDefects,
    openDefects,
    resolvedDefects,
    escapedDefects,
    defectDensity: testRunsCount > 0 ? Number((totalDefects / testRunsCount).toFixed(3)) : totalDefects,
    defectEscapeRate: totalDefects > 0 ? Number(((escapedDefects / totalDefects) * 100).toFixed(2)) : 0,
    meanAgingDays: totalDefects > 0 ? Number((totalAgingDays / totalDefects).toFixed(1)) : 0,
    slaBreachedCount,
  };
}

export async function getQaSnapshot(tenantId: string, filters: DefectListFilters = {}) {
  const [defects, testRunSnap] = await Promise.all([
    listDefects(tenantId, filters),
    adminDb.collection("productionTestRuns").where("tenantId", "==", tenantId).count().get(),
  ]);

  const metrics = buildQualityMetrics(defects, testRunSnap.data().count || 0);

  const trendByMonth: Record<string, number> = {};
  for (const defect of defects) {
    const key = (defect.createdAt || "").slice(0, 7) || "unknown";
    trendByMonth[key] = (trendByMonth[key] || 0) + 1;
  }

  return {
    defects,
    metrics,
    trendByMonth,
  };
}
