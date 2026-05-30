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
import { createNotification, createNotificationEvent, createNotifications, getUserIdsByRoles } from "@/lib/notifications";

export const runtime = "nodejs";

const STATUS_FLOW = ["Submitted", "In Review", "Approved", "In Progress", "Completed"] as const;
const TERMINAL_STATUSES = ["Rejected", "Completed"] as const;

function cleanString(value: unknown) {
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
  return isAdminOrSuper(role);
}

function canMoveExecution(role: string) {
  return isAdminOrSuper(role) || isAccountManager(role) || isProduction(role);
}

function canMoveToReview(role: string) {
  return isAdminOrSuper(role) || isSalesManager(role) || isAccountManager(role);
}

function requiresApproval(data: Record<string, unknown>) {
  const type = String(data.type || "");
  const impactsScope = type === "Scope Change";
  const impactsTimeline = typeof data.estimatedTimelineDays === "number" && data.estimatedTimelineDays > 0;
  const impactsCost = typeof data.estimatedCost === "number" && data.estimatedCost > 0;
  return impactsScope || impactsTimeline || impactsCost;
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

    if (toStatus === "Approved" && data.requestedByUid && data.requestedByUid === me.uid) {
      return NextResponse.json({ ok: false, error: "Requester cannot approve their own request." }, { status: 403 });
    }

    if ((toStatus === "In Progress" || toStatus === "Completed") && !canMoveExecution(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if ((toStatus === "In Progress" || toStatus === "Completed") && requiresApproval(data)) {
      if (String(data.approvalStatus || "").toLowerCase() !== "approved") {
        return NextResponse.json({ ok: false, error: "Change request approval required." }, { status: 403 });
      }
    }

    let projectData: Record<string, unknown> | null = null;
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

    const updateData: Record<string, unknown> = {
      status: toStatus,
      statusHistory,
      updatedAt: serverNow,
    };

    if (toStatus === "Approved") {
      updateData.approvedAt = serverNow;
      updateData.approvedByUid = me.uid;
      updateData.approvalStatus = "approved";
    }

    if (toStatus === "Rejected") {
      updateData.approvalStatus = "rejected";
    }

    if (toStatus === "Completed") {
      updateData.completedAt = serverNow;
    }

    await ref.set(updateData, { merge: true });

    if ((toStatus === "Approved" || toStatus === "Rejected") && data.approvalId) {
      const approvalRef = adminDb.collection("approvals").doc(String(data.approvalId));
      const approvalSnap = await approvalRef.get();
      if (approvalSnap.exists) {
        const approvalData = approvalSnap.data() || {};
        const approvalChain = Array.isArray(approvalData.approvalChain) ? [...approvalData.approvalChain] : [];
        const normalizedRole = normalizeRole(role);
        approvalChain.push({
          role: normalizedRole,
          uid: me.uid,
          decision: toStatus === "Approved" ? "approved" : "rejected",
          note: note || null,
          decidedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await approvalRef.set(
          {
            status: toStatus === "Approved" ? "approved" : "rejected",
            approvalChain,
            finalDecisionBy: { uid: me.uid, role: normalizedRole },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

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

    if (!projectData && projectId) {
      const projectSnap = await adminDb.collection("projects").doc(projectId).get();
      projectData = projectSnap.exists ? projectSnap.data() || {} : null;
    }

    const tenantId = String(data.tenantId || me.tenantId || "");
    const adminIds = await getUserIdsByRoles(["admin", "super_admin"], tenantId || null);
    const actorName = String(me.name || me.fullName || me.displayName || "");
    const notifications: Promise<void>[] = [];
    const changeRequestMessage = `Change request "${data.title || "Untitled"}" moved to ${toStatus}.`;
    const notificationType = toStatus === "Approved" ? "success" : toStatus === "Rejected" ? "warning" : "info";
    const requestedByRole = String(data.requestedByRole || "").toLowerCase();

    if (data.requestedByUid) {
      const deepLink =
        requestedByRole === "am" ? "/am/change-requests" : "/admin/projects/change-requests";
      notifications.push(
        createNotification({
          toUserId: String(data.requestedByUid),
          title: "Change request updated",
          body: changeRequestMessage,
          type: notificationType,
          entityType: "change_request",
          entityId: changeRequestId,
          deepLink,
          createdBy: { uid: me.uid, name: actorName },
          tenantId,
        })
      );
    }

    if (projectData?.ownerAmUid) {
      notifications.push(
        createNotification({
          toUserId: String(projectData.ownerAmUid),
          title: "Change request updated",
          body: changeRequestMessage,
          type: notificationType,
          entityType: "change_request",
          entityId: changeRequestId,
          deepLink: "/am/change-requests",
          createdBy: { uid: me.uid, name: actorName },
          tenantId,
        })
      );
    }

    adminIds.forEach((uid) => {
      if (!uid) return;
      notifications.push(
        createNotification({
          toUserId: uid,
          title: "Change request updated",
          body: changeRequestMessage,
          type: notificationType,
          entityType: "change_request",
          entityId: changeRequestId,
          deepLink: "/admin/projects/change-requests",
          createdBy: { uid: me.uid, name: actorName },
          tenantId,
        })
      );
    });

    await Promise.all(notifications);

    if (["Approved", "Rejected"].includes(toStatus) && data.requestedByUid) {
      await createNotifications({
        recipients: [
          {
            uid: String(data.requestedByUid),
            role: requestedByRole || "am",
            tenantId,
          },
        ],
        tenantId,
        type: "change_request",
        title: `Change request ${toStatus.toLowerCase()}`,
        message: changeRequestMessage,
        entityType: "change_request",
        entityId: changeRequestId,
        createdBy: { uid: me.uid, name: actorName },
      });
    }

    await createNotificationEvent({
      type: "change_request.status_updated",
      title: "Change request updated",
      description: `Change request "${data.title || "Untitled"}" moved to ${toStatus}.`,
      entityType: "change_request",
      entityId: changeRequestId,
      createdByUid: me.uid,
      createdByName: actorName,
      metadata: {
        projectId: data.projectId || "",
        clientId: data.clientId || "",
        status: toStatus,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("change-requests/update-status error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update status right now." }, { status: 500 });
  }
}
