import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createHrNotification } from "@/app/api/admin/hr/_utils";
import { sendBizostoEventNotification } from "@/lib/integrations/slack";

export type LeaveTypeCode = "vacation" | "sick" | "personal" | "unpaid" | "bereavement";
export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type AccrualSchedule = "monthly" | "yearly";

export type LeavePolicy = {
  id: string;
  tenantId: string;
  leaveType: LeaveTypeCode;
  name: string;
  accrualSchedule: AccrualSchedule;
  accrualRateHours: number;
  annualAllocationHours: number;
  maxCarryOverHours: number;
  blackoutDates: string[];
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type LeaveBalance = {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveType: LeaveTypeCode;
  accruedHours: number;
  usedHours: number;
  pendingHours: number;
  availableHours: number;
  carryOverHours: number;
  year: number;
  updatedAt: string | null;
};

export type LeaveRequest = {
  id: string;
  tenantId: string;
  employeeId: string;
  employeeName: string;
  leaveType: LeaveTypeCode;
  policyId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  totalHours: number;
  reason: string | null;
  status: LeaveRequestStatus;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export const DEFAULT_LEAVE_TYPES: LeaveTypeCode[] = ["vacation", "sick", "personal", "unpaid", "bereavement"];

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as Record<string, unknown>)?.toDate === "function") return (value as { toDate: () => Date }).toDate().toISOString();
  return null;
}

function normalizeDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function calculateBusinessDaysInclusive(startDate: Date, endDate: Date) {
  const start = normalizeDateOnly(startDate);
  const end = normalizeDateOnly(endDate);
  if (end < start) {
    throw new Error("End date must be on or after start date.");
  }

  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      days += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function calculateAccruedHours(params: {
  accrualSchedule: AccrualSchedule;
  accrualRateHours: number;
  annualAllocationHours: number;
  from: Date;
  to: Date;
}) {
  const from = normalizeDateOnly(params.from);
  const to = normalizeDateOnly(params.to);
  if (to < from) return 0;

  if (params.accrualSchedule === "monthly") {
    const months =
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - from.getUTCMonth()) +
      1;
    return Math.max(0, months) * Math.max(0, params.accrualRateHours);
  }

  const startYear = from.getUTCFullYear();
  const endYear = to.getUTCFullYear();
  const years = endYear - startYear + 1;
  return Math.max(0, years) * Math.max(0, params.annualAllocationHours || params.accrualRateHours);
}

export function hasDateOverlap(rangeA: { startDate: Date; endDate: Date }, rangeB: { startDate: Date; endDate: Date }) {
  return rangeA.startDate <= rangeB.endDate && rangeA.endDate >= rangeB.startDate;
}

function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function normalizeRole(role?: string | null) {
  return (role || "").toLowerCase().replace(/-/g, "_");
}

function canApproveLeave(role?: string | null) {
  const normalized = normalizeRole(role);
  return normalized === "hr" || normalized === "admin" || normalized === "super_admin" || normalized === "am_manager";
}

async function getActivePolicy(tenantId: string, leaveType: LeaveTypeCode) {
  const snap = await adminDb
    .collection("hr_leave_policies")
    .where("tenantId", "==", tenantId)
    .where("leaveType", "==", leaveType)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new Error(`No active policy configured for ${leaveType} leave.`);
  }

  const doc = snap.docs[0];
  return { ...(doc.data() as LeavePolicy), id: doc.id };
}

async function resolveApprover(tenantId: string, employeeId: string) {
  const employeeDoc = await adminDb.collection("users").doc(employeeId).get();
  if (!employeeDoc.exists) {
    throw new Error("Employee profile not found.");
  }

  const employee = employeeDoc.data() || {};
  const managerId = typeof employee.managerId === "string" && employee.managerId ? employee.managerId : null;

  if (managerId) {
    const managerDoc = await adminDb.collection("users").doc(managerId).get();
    if (managerDoc.exists) {
      const manager = managerDoc.data() || {};
      return {
        reviewerId: managerId,
        reviewerName: String(manager.name || manager.fullName || manager.email || managerId),
      };
    }
  }

  const hrUserSnap = await adminDb
    .collection("users")
    .where("tenantId", "==", tenantId)
    .where("role", "in", ["hr", "admin", "super_admin"])
    .limit(1)
    .get();

  if (hrUserSnap.empty) {
    return { reviewerId: null, reviewerName: null };
  }

  const hrUserDoc = hrUserSnap.docs[0];
  const hrUser = hrUserDoc.data() || {};
  return {
    reviewerId: hrUserDoc.id,
    reviewerName: String(hrUser.name || hrUser.fullName || hrUser.email || hrUserDoc.id),
  };
}

async function getOrCreateBalance(params: { tenantId: string; employeeId: string; leaveType: LeaveTypeCode; year: number }) {
  const key = `${params.tenantId}_${params.employeeId}_${params.leaveType}_${params.year}`;
  const ref = adminDb.collection("hr_leave_balances").doc(key);
  const snap = await ref.get();

  if (!snap.exists) {
    const base = {
      tenantId: params.tenantId,
      employeeId: params.employeeId,
      leaveType: params.leaveType,
      accruedHours: 0,
      usedHours: 0,
      pendingHours: 0,
      availableHours: 0,
      carryOverHours: 0,
      year: params.year,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await ref.set(base);
    return { id: ref.id, ...base };
  }

  return { ...(snap.data() as LeaveBalance), id: snap.id };
}

async function ensureNoOverlap(params: { tenantId: string; employeeId: string; startDate: Date; endDate: Date }) {
  const snap = await adminDb
    .collection("hr_leave_requests")
    .where("tenantId", "==", params.tenantId)
    .where("employeeId", "==", params.employeeId)
    .where("status", "in", ["pending", "approved"])
    .limit(500)
    .get();

  for (const doc of snap.docs) {
    const req = doc.data() || {};
    const existingStart = normalizeDateOnly(new Date(toIso(req.startDate) || req.startDate));
    const existingEnd = normalizeDateOnly(new Date(toIso(req.endDate) || req.endDate));
    if (hasDateOverlap({ startDate: params.startDate, endDate: params.endDate }, { startDate: existingStart, endDate: existingEnd })) {
      throw new Error("Leave request overlaps an existing pending or approved request.");
    }
  }
}

function assertNotBlackout(startDate: Date, endDate: Date, blackoutDates: string[]) {
  const blocked = new Set(blackoutDates || []);
  const cursor = normalizeDateOnly(startDate);
  const end = normalizeDateOnly(endDate);
  while (cursor <= end) {
    const isoDay = cursor.toISOString().slice(0, 10);
    if (blocked.has(isoDay)) {
      throw new Error(`Leave cannot be requested on blackout date ${isoDay}.`);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

export class LeaveService {
  static async upsertPolicy(input: {
    tenantId: string;
    leaveType: LeaveTypeCode;
    name: string;
    accrualSchedule: AccrualSchedule;
    accrualRateHours: number;
    annualAllocationHours: number;
    maxCarryOverHours: number;
    blackoutDates: string[];
  }) {
    const snap = await adminDb
      .collection("hr_leave_policies")
      .where("tenantId", "==", input.tenantId)
      .where("leaveType", "==", input.leaveType)
      .limit(1)
      .get();

    const payload = {
      tenantId: input.tenantId,
      leaveType: input.leaveType,
      name: input.name,
      accrualSchedule: input.accrualSchedule,
      accrualRateHours: input.accrualRateHours,
      annualAllocationHours: input.annualAllocationHours,
      maxCarryOverHours: input.maxCarryOverHours,
      blackoutDates: Array.from(new Set(input.blackoutDates)).sort(),
      isActive: true,
      updatedAt: serverTimestamp(),
    };

    if (snap.empty) {
      const ref = adminDb.collection("hr_leave_policies").doc();
      await ref.set({ ...payload, createdAt: serverTimestamp() });
      return { id: ref.id, ...payload };
    }

    const doc = snap.docs[0];
    await doc.ref.update(payload);
    return { id: doc.id, ...payload };
  }

  static async submitLeaveRequest(input: {
    tenantId: string;
    employeeId: string;
    employeeName: string;
    leaveType: LeaveTypeCode;
    startDate: Date;
    endDate: Date;
    reason?: string | null;
  }) {
    const startDate = normalizeDateOnly(input.startDate);
    const endDate = normalizeDateOnly(input.endDate);

    if (endDate < startDate) {
      throw new Error("End date must be on or after start date.");
    }

    const policy = await getActivePolicy(input.tenantId, input.leaveType);
    assertNotBlackout(startDate, endDate, Array.isArray(policy.blackoutDates) ? policy.blackoutDates : []);
    await ensureNoOverlap({
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      startDate,
      endDate,
    });

    const totalDays = calculateBusinessDaysInclusive(startDate, endDate);
    const totalHours = totalDays * 8;
    const requestYear = startDate.getUTCFullYear();
    const balance = await getOrCreateBalance({
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      leaveType: input.leaveType,
      year: requestYear,
    });

    if (input.leaveType !== "unpaid" && Number(balance.availableHours || 0) < totalHours) {
      throw new Error("Insufficient leave balance for requested dates.");
    }

    const approver = await resolveApprover(input.tenantId, input.employeeId);
    const reqRef = adminDb.collection("hr_leave_requests").doc();

    await adminDb.runTransaction(async (tx) => {
      const balanceRef = adminDb.collection("hr_leave_balances").doc(balance.id);
      const currentBalanceSnap = await tx.get(balanceRef);
      const currentBalance = currentBalanceSnap.data() || balance;
      const availableHours = Number(currentBalance.availableHours || 0);
      const pendingHours = Number(currentBalance.pendingHours || 0);

      if (input.leaveType !== "unpaid" && availableHours < totalHours) {
        throw new Error("Insufficient leave balance for requested dates.");
      }

      tx.set(
        reqRef,
        {
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          employeeName: input.employeeName,
          leaveType: input.leaveType,
          policyId: policy.id,
          startDate,
          endDate,
          totalDays,
          totalHours,
          reason: input.reason || null,
          status: "pending",
          reviewerId: approver.reviewerId,
          reviewerName: approver.reviewerName,
          reviewedAt: null,
          rejectionReason: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      );

      if (input.leaveType !== "unpaid") {
        tx.update(balanceRef, {
          pendingHours: pendingHours + totalHours,
          availableHours: Math.max(0, availableHours - totalHours),
          updatedAt: serverTimestamp(),
        });
      }
    });

    if (approver.reviewerId) {
      await createHrNotification({
        userId: approver.reviewerId,
        title: "New leave request pending approval",
        message: `${input.employeeName} requested ${totalDays} day(s) of ${input.leaveType} leave.`,
        type: "info",
        entityId: reqRef.id,
        deepLink: "/hr/leave",
      });
    }

    return { id: reqRef.id };
  }

  static async getBalances(tenantId: string, employeeId: string, year: number) {
    const snap = await adminDb
      .collection("hr_leave_balances")
      .where("tenantId", "==", tenantId)
      .where("employeeId", "==", employeeId)
      .where("year", "==", year)
      .get();

    const balances = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        tenantId: String(data.tenantId || ""),
        employeeId: String(data.employeeId || ""),
        leaveType: data.leaveType as LeaveTypeCode,
        accruedHours: Number(data.accruedHours || 0),
        usedHours: Number(data.usedHours || 0),
        pendingHours: Number(data.pendingHours || 0),
        availableHours: Number(data.availableHours || 0),
        carryOverHours: Number(data.carryOverHours || 0),
        year: Number(data.year || year),
        updatedAt: toIso(data.updatedAt),
      } satisfies LeaveBalance;
    });

    const byType = new Map<LeaveTypeCode, LeaveBalance>();
    balances.forEach((balance) => byType.set(balance.leaveType, balance));

    return DEFAULT_LEAVE_TYPES.map((leaveType) => {
      const existing = byType.get(leaveType);
      return (
        existing || {
          id: `${tenantId}_${employeeId}_${leaveType}_${year}`,
          tenantId,
          employeeId,
          leaveType,
          accruedHours: 0,
          usedHours: 0,
          pendingHours: 0,
          availableHours: 0,
          carryOverHours: 0,
          year,
          updatedAt: null,
        }
      );
    });
  }

  static async listRequests(params: {
    tenantId: string;
    requesterUserId: string;
    requesterRole: string;
    employeeId?: string;
    status?: LeaveRequestStatus;
  }) {
    let query = adminDb.collection("hr_leave_requests").where("tenantId", "==", params.tenantId);
    if (params.status) {
      query = query.where("status", "==", params.status);
    }

    if (params.employeeId) {
      query = query.where("employeeId", "==", params.employeeId);
    } else if (!canApproveLeave(params.requesterRole)) {
      query = query.where("employeeId", "==", params.requesterUserId);
    }

    const snap = await query.limit(500).get();
    return snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        tenantId: String(data.tenantId || ""),
        employeeId: String(data.employeeId || ""),
        employeeName: String(data.employeeName || ""),
        leaveType: data.leaveType as LeaveTypeCode,
        policyId: String(data.policyId || ""),
        startDate: toIso(data.startDate) || "",
        endDate: toIso(data.endDate) || "",
        totalDays: Number(data.totalDays || 0),
        totalHours: Number(data.totalHours || 0),
        reason: data.reason || null,
        status: (data.status || "pending") as LeaveRequestStatus,
        reviewerId: data.reviewerId || null,
        reviewerName: data.reviewerName || null,
        reviewedAt: toIso(data.reviewedAt),
        rejectionReason: data.rejectionReason || null,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      } satisfies LeaveRequest;
    });
  }

  static async approveRequest(params: { tenantId: string; requestId: string; actorUserId: string; actorName: string; actorRole: string }) {
    if (!canApproveLeave(params.actorRole)) {
      throw new Error("You are not allowed to approve leave requests.");
    }

    const reqRef = adminDb.collection("hr_leave_requests").doc(params.requestId);
    await adminDb.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new Error("Leave request not found.");
      const req = reqSnap.data() || {};

      if (req.tenantId !== params.tenantId) throw new Error("Forbidden.");
      if (req.status !== "pending") throw new Error("Only pending requests can be approved.");

      const year = new Date(toIso(req.startDate) || req.startDate).getUTCFullYear();
      const balanceId = `${params.tenantId}_${req.employeeId}_${req.leaveType}_${year}`;
      const balanceRef = adminDb.collection("hr_leave_balances").doc(balanceId);
      const balanceSnap = await tx.get(balanceRef);
      const balance = balanceSnap.data() || {};

      const pendingHours = Number(balance.pendingHours || 0);
      const usedHours = Number(balance.usedHours || 0);
      const totalHours = Number(req.totalHours || 0);

      tx.update(reqRef, {
        status: "approved",
        reviewerId: params.actorUserId,
        reviewerName: params.actorName,
        reviewedAt: serverTimestamp(),
        rejectionReason: null,
        updatedAt: serverTimestamp(),
      });

      if (req.leaveType !== "unpaid") {
        tx.set(
          balanceRef,
          {
            tenantId: params.tenantId,
            employeeId: req.employeeId,
            leaveType: req.leaveType,
            year,
            usedHours: usedHours + totalHours,
            pendingHours: Math.max(0, pendingHours - totalHours),
            availableHours: Number(balance.availableHours || 0),
            accruedHours: Number(balance.accruedHours || 0),
            carryOverHours: Number(balance.carryOverHours || 0),
            updatedAt: serverTimestamp(),
            createdAt: balance.createdAt || serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    const requestSnap = await reqRef.get();
    const request = requestSnap.data() || {};
    await createHrNotification({
      userId: String(request.employeeId || ""),
      title: "Leave request approved",
      message: `Your ${request.leaveType || "leave"} request has been approved.`,
      type: "success",
      entityId: params.requestId,
      deepLink: "/hr/leave",
    });

    await sendBizostoEventNotification({
      type: "leave_approved",
      tenantId: params.tenantId,
      targetUserId: String(request.employeeId || ""),
      leaveType: String(request.leaveType || "leave"),
    }).catch((error) => {
      console.error("slack leave approval notification failed:", error);
    });
  }

  static async rejectRequest(params: {
    tenantId: string;
    requestId: string;
    actorUserId: string;
    actorName: string;
    actorRole: string;
    reason: string;
  }) {
    if (!canApproveLeave(params.actorRole)) {
      throw new Error("You are not allowed to reject leave requests.");
    }

    const reqRef = adminDb.collection("hr_leave_requests").doc(params.requestId);
    await adminDb.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new Error("Leave request not found.");
      const req = reqSnap.data() || {};
      if (req.tenantId !== params.tenantId) throw new Error("Forbidden.");
      if (req.status !== "pending") throw new Error("Only pending requests can be rejected.");

      const year = new Date(toIso(req.startDate) || req.startDate).getUTCFullYear();
      const balanceId = `${params.tenantId}_${req.employeeId}_${req.leaveType}_${year}`;
      const balanceRef = adminDb.collection("hr_leave_balances").doc(balanceId);
      const balanceSnap = await tx.get(balanceRef);
      const balance = balanceSnap.data() || {};
      const totalHours = Number(req.totalHours || 0);

      tx.update(reqRef, {
        status: "rejected",
        reviewerId: params.actorUserId,
        reviewerName: params.actorName,
        reviewedAt: serverTimestamp(),
        rejectionReason: params.reason,
        updatedAt: serverTimestamp(),
      });

      if (req.leaveType !== "unpaid" && balanceSnap.exists) {
        tx.update(balanceRef, {
          pendingHours: Math.max(0, Number(balance.pendingHours || 0) - totalHours),
          availableHours: Number(balance.availableHours || 0) + totalHours,
          updatedAt: serverTimestamp(),
        });
      }
    });

    const requestSnap = await reqRef.get();
    const request = requestSnap.data() || {};
    await createHrNotification({
      userId: String(request.employeeId || ""),
      title: "Leave request rejected",
      message: `Your ${request.leaveType || "leave"} request was rejected: ${params.reason}`,
      type: "warning",
      entityId: params.requestId,
      deepLink: "/hr/leave",
    });
  }

  static async accrueLeaveForMonth(params: { tenantId: string; year: number; month: number }) {
    const policiesSnap = await adminDb
      .collection("hr_leave_policies")
      .where("tenantId", "==", params.tenantId)
      .where("isActive", "==", true)
      .get();

    const usersSnap = await adminDb
      .collection("users")
      .where("tenantId", "==", params.tenantId)
      .where("status", "in", ["active", "Active"])
      .get();

    const processed: Array<{ employeeId: string; leaveType: string; hours: number }> = [];

    for (const policyDoc of policiesSnap.docs) {
      const policy = policyDoc.data() || {};
      const leaveType = policy.leaveType as LeaveTypeCode;
      const hours =
        policy.accrualSchedule === "yearly" && params.month !== 1
          ? 0
          : policy.accrualSchedule === "yearly"
          ? Number(policy.annualAllocationHours || 0)
          : Number(policy.accrualRateHours || 0);

      if (hours <= 0) continue;

      for (const userDoc of usersSnap.docs) {
        const user = userDoc.data() || {};
        const balance = await getOrCreateBalance({
          tenantId: params.tenantId,
          employeeId: userDoc.id,
          leaveType,
          year: params.year,
        });

        const newAccrued = Number(balance.accruedHours || 0) + hours;
        const newAvailable = Number(balance.availableHours || 0) + hours;
        await adminDb.collection("hr_leave_balances").doc(balance.id).set(
          {
            accruedHours: newAccrued,
            availableHours: newAvailable,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        await adminDb.collection("hr_leave_accrual_history").add({
          tenantId: params.tenantId,
          employeeId: userDoc.id,
          employeeName: String(user.name || user.fullName || user.email || userDoc.id),
          leaveType,
          policyId: policyDoc.id,
          hours,
          accrualSchedule: policy.accrualSchedule,
          accrualYear: params.year,
          accrualMonth: params.month,
          createdAt: serverTimestamp(),
        });

        processed.push({ employeeId: userDoc.id, leaveType, hours });
      }
    }

    return processed;
  }

  static async enforceCarryOverForYear(params: { tenantId: string; fromYear: number; toYear: number }) {
    const balances = await adminDb
      .collection("hr_leave_balances")
      .where("tenantId", "==", params.tenantId)
      .where("year", "==", params.fromYear)
      .get();

    for (const balanceDoc of balances.docs) {
      const balance = balanceDoc.data() || {};
      const policy = await getActivePolicy(params.tenantId, balance.leaveType as LeaveTypeCode);
      const carryOver = Math.max(0, Math.min(Number(balance.availableHours || 0), Number(policy.maxCarryOverHours || 0)));
      const nextBalance = await getOrCreateBalance({
        tenantId: params.tenantId,
        employeeId: String(balance.employeeId || ""),
        leaveType: balance.leaveType as LeaveTypeCode,
        year: params.toYear,
      });

      await adminDb.collection("hr_leave_balances").doc(nextBalance.id).set(
        {
          carryOverHours: carryOver,
          accruedHours: Number(nextBalance.accruedHours || 0) + carryOver,
          availableHours: Number(nextBalance.availableHours || 0) + carryOver,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }
}
