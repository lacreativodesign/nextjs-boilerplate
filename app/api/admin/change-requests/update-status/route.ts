import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  getCurrentUser,
  isAccountManager,
  isAdminOrSuper,
  isProduction,
  isSalesManager,
  normalizeRole,
} from "../../_utils";

export const runtime = "nodejs";

const STATUS_FLOW = ["Submitted", "In Review", "Approved", "In Progress", "Completed"] as const;
const TERMINAL_STATUSES = ["Rejected", "Completed"] as const;

function cleanString(value: any) {
  return String(value || "").trim();
}

function isValidStatus(status: string) {
  return status === "Rejected" || STATUS_FLOW.includes(status as (typeof STATUS_FLOW)[number]);
}

function canTransition(fromStatus: string, toStatus: string) {
  if (!isValidStatus(fromStatus) || !isValidStatus(toStatus)) return false;
  if (fromStatus === toStatus) return false;
  if (TERMINAL_STATUSES.includes(fromStatus as (typeof TERMINAL_STATUSES)[number])) return false;

  if (fromStatus === "Submitted") return toStatus === "In Review";
  if (fromStatus === "In Review") return toStatus === "Approved" || toStatus === "Rejected";
  if (fromStatus === "Approved") return toStatus === "In Progress";
  if (fromStatus === "In Progress") return toStatus === "Completed";

  return false;
}

function canApproveOrReject(role: string) {
  return isAdminOrSuper(role) || isSalesManager(role);
}

function canMoveExecution(role: string) {
  return isAdminOrSuper(role) || isAccountManager(role) || isProduction(role);
}

function canMoveToReview(role: string) {
  return isAdminOrSuper(role) || isSalesManager(role) || isAccountManager(role);
}

async function enqueueEvent(type: "CHANGE_REQUEST_APPROVED" | "CHANGE_REQUEST_REJECTED" | "CHANGE_REQUEST_COMPLETED", payload: {
  changeRequestId: string;
  projectId: string;
  clientId: string;
  status: string;
  actorUid: string;
  actorRole: string;
}) {
  try {
    await adminDb.collection("eventsQueue").add({
      type,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      payload: {
        ...payload,
        timestamp: admin.firestore.Timestamp.now(),
      },
    });
  } catch (eventError) {
    console.error("eventsQueue enqueue error:", eventError);
  }
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const role = normalizeRole(me.role);
    const body = await req.json().catch(() => ({}));
    const changeRequestId = cleanString(body?.changeRequestId);
    const toStatus = cleanString(body?.toStatus);
    const note = cleanString(body?.note);

    if (!changeRequestId || !toStatus) {
      return NextResponse.json({ ok: false, error: "Missing change request update." }, { status: 400 });
    }

    if (!isValidStatus(toStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
    }

    const ref = adminDb.collection("changeRequests").doc(changeRequestId);
    const snap = await ref.get();

    if (!snap.exists || snap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Change request not found." }, { status: 404 });
    }

    const data = snap.data() || {};
    const fromStatus = cleanString(data.status) || "Submitted";

    if (!canTransition(fromStatus, toStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid status transition." }, { status: 400 });
    }

    if (toStatus === "In Review" && !canMoveToReview(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if ((toStatus === "Approved" || toStatus === "Rejected") && !canApproveOrReject(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if ((toStatus === "In Progress" || toStatus === "Completed") && !canMoveExecution(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    let projectData: Record<string, any> | null = null;
    const projectId = data.projectId || "";

    if ((isAccountManager(role) || isProduction(role)) && projectId) {
      const projectSnap = await adminDb.collection("projects").doc(projectId).get();
      projectData = projectSnap.exists ? projectSnap.data() || {} : null;
    }

    if (isAccountManager(role)) {
      const isOwner =
        projectData && (projectData.ownerAmUid === me.uid || (!projectData.ownerAmUid && projectData.createdByUid === me.uid));
      if (!isOwner) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    if (isProduction(role)) {
      const assignedToUid = data.assignedToUid || "";
      const isAssigned = assignedToUid === me.uid || (projectData ? projectData.productionUid === me.uid : false);

      if (!isAssigned) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    const now = admin.firestore.Timestamp.now();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    const statusHistory = Array.isArray(data.statusHistory) ? [...data.statusHistory] : [];
    statusHistory.push({
      from: fromStatus,
      to: toStatus,
      byUid: me.uid,
      byRole: role,
      at: now,
      note: note || undefined,
    });

    const updateData: Record<string, any> = {
      status: toStatus,
      statusHistory,
      updatedAt: serverNow,
    };

    if (toStatus === "Approved") {
      updateData.approvedAt = serverNow;
      updateData.approvedByUid = me.uid;
    }

    if (toStatus === "Completed") {
      updateData.completedAt = serverNow;
    }

    await ref.set(updateData, { merge: true });

    if (toStatus === "Approved") {
      await enqueueEvent("CHANGE_REQUEST_APPROVED", {
        changeRequestId,
        projectId: data.projectId || "",
        clientId: data.clientId || "",
        status: toStatus,
        actorUid: me.uid,
        actorRole: role,
      });
    }

    if (toStatus === "Rejected") {
      await enqueueEvent("CHANGE_REQUEST_REJECTED", {
        changeRequestId,
        projectId: data.projectId || "",
        clientId: data.clientId || "",
        status: toStatus,
        actorUid: me.uid,
        actorRole: role,
      });
    }

    if (toStatus === "Completed") {
      await enqueueEvent("CHANGE_REQUEST_COMPLETED", {
        changeRequestId,
        projectId: data.projectId || "",
        clientId: data.clientId || "",
        status: toStatus,
        actorUid: me.uid,
        actorRole: role,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("change-requests/update-status error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update status right now." }, { status: 500 });
  }
}
