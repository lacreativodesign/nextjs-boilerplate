import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

export type TimeEntrySource = "clock" | "manual" | "timer";
export type TimesheetPeriodType = "weekly" | "bi_weekly" | "monthly";
export type TimesheetStatus = "draft" | "submitted" | "approved" | "rejected";

const MAX_MINUTES_PER_DAY = 24 * 60;
const OVERTIME_THRESHOLD_MINUTES_PER_WEEK = 40 * 60;
const AUTO_BREAK_THRESHOLD_MINUTES = 6 * 60;
const REQUIRED_BREAK_MINUTES = 30;

export type TimeEntryRecord = {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  source: TimeEntrySource;
  startAt: string;
  endAt: string | null;
  durationMinutes: number;
  breakMinutes: number;
  isBreakRequired: boolean;
  billable: boolean;
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  taskName: string | null;
  notes: string | null;
  status: "running" | "completed";
  createdAt: string | null;
  updatedAt: string | null;
};

export type TimesheetRecord = {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  periodType: TimesheetPeriodType;
  periodStart: string;
  periodEnd: string;
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  overtimeMinutes: number;
  status: TimesheetStatus;
  submittedAt: string | null;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CreateTimeEntryInput = {
  tenantId: string;
  userId: string;
  userName: string;
  source: TimeEntrySource;
  startAt: Date;
  endAt?: Date | null;
  breakMinutes?: number;
  billable: boolean;
  projectId?: string | null;
  projectName?: string | null;
  taskId?: string | null;
  taskName?: string | null;
  notes?: string | null;
};

export type ListTimeEntriesFilters = {
  tenantId: string;
  requesterUserId: string;
  requesterRole: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  projectId?: string;
};

export type GenerateTimesheetInput = {
  tenantId: string;
  userId: string;
  userName: string;
  periodType: TimesheetPeriodType;
  anchorDate?: Date;
};

function normalizeRole(role?: string) {
  return (role || "").toLowerCase().replace(/-/g, "_");
}

function canManageTimesheets(role?: string) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "super_admin" || normalized === "hr";
}

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  return null;
}

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

export function calculateDurationMinutes(startAt: Date, endAt: Date, breakMinutes: number) {
  const rawMinutes = Math.floor((endAt.getTime() - startAt.getTime()) / (1000 * 60));
  if (rawMinutes <= 0) {
    throw new Error("End time must be after start time.");
  }
  if (breakMinutes < 0) {
    throw new Error("Break minutes cannot be negative.");
  }
  if (breakMinutes >= rawMinutes) {
    throw new Error("Break minutes must be less than total duration.");
  }
  return rawMinutes - breakMinutes;
}

export function shouldRequireBreak(totalWorkedMinutes: number) {
  return totalWorkedMinutes > AUTO_BREAK_THRESHOLD_MINUTES;
}

export function calculateAutomaticBreak(totalWorkedMinutes: number, existingBreakMinutes: number) {
  if (!shouldRequireBreak(totalWorkedMinutes)) {
    return existingBreakMinutes;
  }
  return Math.max(existingBreakMinutes, REQUIRED_BREAK_MINUTES);
}

function getDayWindow(date: Date) {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  return { dayStart, dayEnd };
}

function getPeriodBounds(periodType: TimesheetPeriodType, anchorDateInput?: Date) {
  const anchorDate = anchorDateInput ? new Date(anchorDateInput) : new Date();
  const utcAnchor = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate()));

  if (periodType === "monthly") {
    const start = new Date(Date.UTC(utcAnchor.getUTCFullYear(), utcAnchor.getUTCMonth(), 1));
    const end = new Date(Date.UTC(utcAnchor.getUTCFullYear(), utcAnchor.getUTCMonth() + 1, 1));
    return { periodStart: start, periodEndExclusive: end };
  }

  const dayOfWeek = utcAnchor.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const start = new Date(utcAnchor);
  start.setUTCDate(start.getUTCDate() + mondayOffset);

  if (periodType === "weekly") {
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { periodStart: start, periodEndExclusive: end };
  }

  const biWeeklyStart = new Date(start);
  const weekNumber = getIsoWeek(utcAnchor);
  if (weekNumber % 2 === 0) {
    biWeeklyStart.setUTCDate(biWeeklyStart.getUTCDate() - 7);
  }

  const biWeeklyEnd = new Date(biWeeklyStart);
  biWeeklyEnd.setUTCDate(biWeeklyEnd.getUTCDate() + 14);
  return { periodStart: biWeeklyStart, periodEndExclusive: biWeeklyEnd };
}

function getIsoWeek(date: Date) {
  const tempDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = tempDate.getUTCDay() || 7;
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function areIntervalsOverlapping(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

async function getEntriesForUserRange(tenantId: string, userId: string, from: Date, to: Date) {
  const snap = await adminDb
    .collection("hr_time_entries")
    .where("tenantId", "==", tenantId)
    .where("userId", "==", userId)
    .where("startAt", ">=", from)
    .where("startAt", "<", to)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
}

async function assertNoOverlap(params: {
  tenantId: string;
  userId: string;
  startAt: Date;
  endAt: Date;
  excludedEntryId?: string;
}) {
  const { dayStart, dayEnd } = getDayWindow(params.startAt);
  const entries = await getEntriesForUserRange(params.tenantId, params.userId, dayStart, dayEnd);

  for (const entry of entries) {
    if (params.excludedEntryId && entry.id === params.excludedEntryId) continue;
    const existingStart = toDate(toIso(entry.startAt) || "");
    const existingEnd = entry.endAt ? toDate(toIso(entry.endAt) || "") : new Date("2999-12-31T00:00:00.000Z");
    if (areIntervalsOverlapping(params.startAt, params.endAt, existingStart, existingEnd)) {
      throw new Error("Time entry overlaps with an existing entry.");
    }
  }
}

async function assertWithinDailyLimit(params: {
  tenantId: string;
  userId: string;
  entryDate: Date;
  candidateDurationMinutes: number;
  excludedEntryId?: string;
}) {
  const { dayStart, dayEnd } = getDayWindow(params.entryDate);
  const entries = await getEntriesForUserRange(params.tenantId, params.userId, dayStart, dayEnd);

  const minutesUsed = entries.reduce((total, entry) => {
    if (params.excludedEntryId && entry.id === params.excludedEntryId) return total;
    return total + (typeof entry.durationMinutes === "number" ? entry.durationMinutes : 0);
  }, 0);

  if (minutesUsed + params.candidateDurationMinutes > MAX_MINUTES_PER_DAY) {
    throw new Error("Total tracked time cannot exceed 24 hours in one day.");
  }
}

export function calculateOvertimeMinutes(totalMinutes: number) {
  return Math.max(0, totalMinutes - OVERTIME_THRESHOLD_MINUTES_PER_WEEK);
}

export function mapTimeEntry(docId: string, data: any): TimeEntryRecord {
  return {
    id: docId,
    tenantId: data.tenantId,
    userId: data.userId,
    userName: data.userName,
    source: data.source,
    startAt: toIso(data.startAt) || "",
    endAt: toIso(data.endAt),
    durationMinutes: data.durationMinutes || 0,
    breakMinutes: data.breakMinutes || 0,
    isBreakRequired: Boolean(data.isBreakRequired),
    billable: Boolean(data.billable),
    projectId: data.projectId || null,
    projectName: data.projectName || null,
    taskId: data.taskId || null,
    taskName: data.taskName || null,
    notes: data.notes || null,
    status: data.status || "completed",
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export function mapTimesheet(docId: string, data: any): TimesheetRecord {
  return {
    id: docId,
    tenantId: data.tenantId,
    userId: data.userId,
    userName: data.userName,
    periodType: data.periodType,
    periodStart: toIso(data.periodStart) || "",
    periodEnd: toIso(data.periodEnd) || "",
    totalMinutes: data.totalMinutes || 0,
    billableMinutes: data.billableMinutes || 0,
    nonBillableMinutes: data.nonBillableMinutes || 0,
    overtimeMinutes: data.overtimeMinutes || 0,
    status: data.status || "draft",
    submittedAt: toIso(data.submittedAt),
    submittedBy: data.submittedBy || null,
    approvedAt: toIso(data.approvedAt),
    approvedBy: data.approvedBy || null,
    rejectedAt: toIso(data.rejectedAt),
    rejectedBy: data.rejectedBy || null,
    rejectionReason: data.rejectionReason || null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export class TimeTrackingService {
  static async createTimeEntry(input: CreateTimeEntryInput) {
    const startAt = new Date(input.startAt);
    const endAt = input.endAt ? new Date(input.endAt) : null;

    if (endAt && endAt <= startAt) {
      throw new Error("End time must be after start time.");
    }

    const runningEntrySnap = await adminDb
      .collection("hr_time_entries")
      .where("tenantId", "==", input.tenantId)
      .where("userId", "==", input.userId)
      .where("status", "==", "running")
      .limit(1)
      .get();

    if (!runningEntrySnap.empty) {
      throw new Error("User already has an active time entry.");
    }

    let durationMinutes = 0;
    let breakMinutes = input.breakMinutes || 0;
    let isBreakRequired = false;
    let status: "running" | "completed" = "running";

    if (endAt) {
      const grossMinutes = Math.floor((endAt.getTime() - startAt.getTime()) / (1000 * 60));
      breakMinutes = calculateAutomaticBreak(grossMinutes, breakMinutes);
      durationMinutes = calculateDurationMinutes(startAt, endAt, breakMinutes);
      isBreakRequired = shouldRequireBreak(grossMinutes);
      status = "completed";

      await assertNoOverlap({ tenantId: input.tenantId, userId: input.userId, startAt, endAt });
      await assertWithinDailyLimit({
        tenantId: input.tenantId,
        userId: input.userId,
        entryDate: startAt,
        candidateDurationMinutes: durationMinutes,
      });
    }

    const docRef = await adminDb.collection("hr_time_entries").add({
      tenantId: input.tenantId,
      userId: input.userId,
      userName: input.userName,
      source: input.source,
      startAt,
      endAt,
      durationMinutes,
      breakMinutes,
      isBreakRequired,
      billable: input.billable,
      projectId: input.projectId || null,
      projectName: input.projectName || null,
      taskId: input.taskId || null,
      taskName: input.taskName || null,
      notes: input.notes || null,
      status,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const saved = await docRef.get();
    return mapTimeEntry(saved.id, saved.data());
  }

  static async clockOut(entryId: string, tenantId: string, userId: string, breakMinutes = 0) {
    const ref = adminDb.collection("hr_time_entries").doc(entryId);
    const snap = await ref.get();

    if (!snap.exists) {
      throw new Error("Time entry not found.");
    }

    const entry = snap.data() as any;
    if (entry.tenantId !== tenantId) {
      throw new Error("Forbidden");
    }
    if (entry.userId !== userId) {
      throw new Error("Forbidden");
    }
    if (entry.status !== "running") {
      throw new Error("Time entry is already completed.");
    }

    const startAt = toDate(toIso(entry.startAt) || "");
    const endAt = new Date();
    const grossMinutes = Math.floor((endAt.getTime() - startAt.getTime()) / (1000 * 60));
    const normalizedBreakMinutes = calculateAutomaticBreak(grossMinutes, breakMinutes);
    const durationMinutes = calculateDurationMinutes(startAt, endAt, normalizedBreakMinutes);

    await assertNoOverlap({ tenantId, userId: entry.userId, startAt, endAt, excludedEntryId: entryId });
    await assertWithinDailyLimit({
      tenantId,
      userId: entry.userId,
      entryDate: startAt,
      candidateDurationMinutes: durationMinutes,
      excludedEntryId: entryId,
    });

    await ref.update({
      endAt,
      durationMinutes,
      breakMinutes: normalizedBreakMinutes,
      isBreakRequired: shouldRequireBreak(grossMinutes),
      status: "completed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updated = await ref.get();
    return mapTimeEntry(updated.id, updated.data());
  }

  static async listTimeEntries(filters: ListTimeEntriesFilters) {
    const manageAll = canManageTimesheets(filters.requesterRole);
    const effectiveUserId = manageAll ? filters.userId : filters.requesterUserId;

    let query: FirebaseFirestore.Query = adminDb.collection("hr_time_entries").where("tenantId", "==", filters.tenantId);

    if (effectiveUserId) {
      query = query.where("userId", "==", effectiveUserId);
    }

    if (filters.projectId) {
      query = query.where("projectId", "==", filters.projectId);
    }

    if (filters.startDate) {
      query = query.where("startAt", ">=", filters.startDate);
    }

    if (filters.endDate) {
      query = query.where("startAt", "<=", filters.endDate);
    }

    const snap = await query.orderBy("startAt", "desc").limit(500).get();
    return snap.docs.map((doc) => mapTimeEntry(doc.id, doc.data()));
  }

  static async generateTimesheet(input: GenerateTimesheetInput) {
    const { periodStart, periodEndExclusive } = getPeriodBounds(input.periodType, input.anchorDate);

    const entriesSnap = await adminDb
      .collection("hr_time_entries")
      .where("tenantId", "==", input.tenantId)
      .where("userId", "==", input.userId)
      .where("status", "==", "completed")
      .where("startAt", ">=", periodStart)
      .where("startAt", "<", periodEndExclusive)
      .orderBy("startAt", "asc")
      .get();

    const entries = entriesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));

    const totalMinutes = entries.reduce((acc, item) => acc + (item.durationMinutes || 0), 0);
    const billableMinutes = entries.reduce((acc, item) => acc + (item.billable ? item.durationMinutes || 0 : 0), 0);
    const nonBillableMinutes = totalMinutes - billableMinutes;
    const overtimeMinutes = input.periodType === "weekly" ? calculateOvertimeMinutes(totalMinutes) : 0;

    const existingSnap = await adminDb
      .collection("hr_timesheets")
      .where("tenantId", "==", input.tenantId)
      .where("userId", "==", input.userId)
      .where("periodType", "==", input.periodType)
      .where("periodStart", "==", periodStart)
      .limit(1)
      .get();

    const payload = {
      tenantId: input.tenantId,
      userId: input.userId,
      userName: input.userName,
      periodType: input.periodType,
      periodStart,
      periodEnd: new Date(periodEndExclusive.getTime() - 1),
      entryIds: entries.map((entry) => entry.id),
      totalMinutes,
      billableMinutes,
      nonBillableMinutes,
      overtimeMinutes,
      status: "draft" as TimesheetStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    let ref: FirebaseFirestore.DocumentReference;
    if (!existingSnap.empty) {
      ref = existingSnap.docs[0].ref;
      await ref.update({
        ...payload,
        createdAt: existingSnap.docs[0].data().createdAt || admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      ref = await adminDb.collection("hr_timesheets").add(payload);
    }

    const timesheetSnap = await ref.get();
    return mapTimesheet(timesheetSnap.id, timesheetSnap.data());
  }

  static async listTimesheets(params: {
    tenantId: string;
    requesterUserId: string;
    requesterRole: string;
    userId?: string;
    status?: TimesheetStatus;
  }) {
    const manageAll = canManageTimesheets(params.requesterRole);
    const effectiveUserId = manageAll ? params.userId : params.requesterUserId;

    let query: FirebaseFirestore.Query = adminDb.collection("hr_timesheets").where("tenantId", "==", params.tenantId);
    if (effectiveUserId) {
      query = query.where("userId", "==", effectiveUserId);
    }
    if (params.status) {
      query = query.where("status", "==", params.status);
    }

    const snap = await query.orderBy("periodStart", "desc").limit(200).get();
    return snap.docs.map((doc) => mapTimesheet(doc.id, doc.data()));
  }

  static async submitTimesheet(params: {
    timesheetId: string;
    tenantId: string;
    requesterUserId: string;
    requesterRole: string;
  }) {
    const ref = adminDb.collection("hr_timesheets").doc(params.timesheetId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Timesheet not found.");
    const sheet = snap.data() as any;

    if (sheet.tenantId !== params.tenantId) throw new Error("Forbidden");
    if (sheet.userId !== params.requesterUserId && !canManageTimesheets(params.requesterRole)) {
      throw new Error("Forbidden");
    }
    if (sheet.status !== "draft" && sheet.status !== "rejected") {
      throw new Error("Only draft or rejected timesheets can be submitted.");
    }

    await ref.update({
      status: "submitted",
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      submittedBy: params.requesterUserId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectionReason: null,
      rejectedAt: null,
      rejectedBy: null,
    });

    const updated = await ref.get();
    return mapTimesheet(updated.id, updated.data());
  }

  static async approveTimesheet(params: {
    timesheetId: string;
    tenantId: string;
    requesterUserId: string;
    requesterRole: string;
    approve: boolean;
    rejectionReason?: string;
  }) {
    if (!canManageTimesheets(params.requesterRole)) {
      throw new Error("Forbidden");
    }

    const ref = adminDb.collection("hr_timesheets").doc(params.timesheetId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Timesheet not found.");

    const sheet = snap.data() as any;
    if (sheet.tenantId !== params.tenantId) throw new Error("Forbidden");
    if (sheet.status !== "submitted") {
      throw new Error("Only submitted timesheets can be reviewed.");
    }

    await ref.update({
      status: params.approve ? "approved" : "rejected",
      approvedAt: params.approve ? admin.firestore.FieldValue.serverTimestamp() : null,
      approvedBy: params.approve ? params.requesterUserId : null,
      rejectedAt: params.approve ? null : admin.firestore.FieldValue.serverTimestamp(),
      rejectedBy: params.approve ? null : params.requesterUserId,
      rejectionReason: params.approve ? null : params.rejectionReason || "Rejected by manager",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updated = await ref.get();
    return mapTimesheet(updated.id, updated.data());
  }
}
