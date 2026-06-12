import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";
import { logEvent } from "@/lib/audit";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { requireClient } from "../../_utils";

function cleanString(value: any) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const changeRequestId = cleanString(body?.changeRequestId || body?.id);
    const decision = cleanString(body?.decision || body?.status || "").toLowerCase();

    if (!changeRequestId || !["approve", "reject", "approved", "rejected"].includes(decision)) {
      return NextResponse.json({ ok: false, error: "Invalid change request decision." }, { status: 400 });
    }

    const toStatus = decision.startsWith("approve") ? "Approved" : "Rejected";
    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant context missing." }, { status: 403 });
    }

    const ref = adminDb.collection("changeRequests").doc(changeRequestId);
    const snap = await ref.get();

    if (!snap.exists || snap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Change request not found." }, { status: 404 });
    }

    const data = snap.data() || {};
    const docTenant = String(data.tenantId || DEFAULT_TENANT_ID);
    if (docTenant !== String(tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (String(data.clientId || "") !== auth.clientId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const currentStatus = String(data.status || "Submitted");
    if (["Approved", "Rejected", "Completed"].includes(currentStatus)) {
      return NextResponse.json({ ok: false, error: "Change request already finalized." }, { status: 400 });
    }

    const now = admin.firestore.Timestamp.now();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();
    const statusHistory = Array.isArray(data.statusHistory) ? [...data.statusHistory] : [];
    statusHistory.push({
      from: currentStatus,
      to: toStatus,
      byUid: auth.user.uid,
      byRole: "client",
      at: now,
      note: `Client ${toStatus.toLowerCase()}.`,
    });

    await ref.set(
      {
        status: toStatus,
        approvedAt: toStatus === "Approved" ? serverNow : null,
        approvedByUid: auth.user.uid,
        updatedAt: serverNow,
        tenantId,
        statusHistory,
      },
      { merge: true }
    );

    const projectId = String(data.projectId || "");
    const projectSnap = projectId ? await adminDb.collection("projects").doc(projectId).get() : null;
    const project = projectSnap?.exists ? projectSnap.data() || {} : {};
    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "Client";
    const adminIds = await getUserIdsByRoles(["admin", "super_admin"], tenantId);

    const notifications: Promise<void>[] = [];
    if (project?.ownerAmUid) {
      notifications.push(
        createNotification({
          toUserId: String(project.ownerAmUid),
          title: "Client decision on change request",
          body: `${project.projectName || "Project"} change request was ${toStatus.toLowerCase()} by the client.`,
          type: toStatus === "Approved" ? "success" : "warning",
          entityType: "change_request",
          entityId: changeRequestId,
          deepLink: "/am/change-requests",
          createdBy: { uid: auth.user.uid, name: actorName },
          tenantId,
        })
      );
    }

    adminIds.forEach((uid) => {
      notifications.push(
        createNotification({
          toUserId: uid,
          title: "Client decision on change request",
          body: `${project.projectName || "Project"} change request was ${toStatus.toLowerCase()} by the client.`,
          type: toStatus === "Approved" ? "success" : "warning",
          entityType: "change_request",
          entityId: changeRequestId,
          deepLink: "/admin/projects/change-requests",
          createdBy: { uid: auth.user.uid, name: actorName },
          tenantId,
        })
      );
    });

    await Promise.all(notifications);

    await logEvent({
      tenantId,
      type: toStatus === "Approved" ? "change_request.client_approved" : "change_request.client_rejected",
      title: "Client change request decision",
      description: `${data.title || "Change request"} was ${toStatus.toLowerCase()} by the client.`,
      entityType: "change_request",
      entityId: changeRequestId,
      actor: { uid: auth.user.uid, name: actorName },
      metadata: {
        projectId,
        clientId: auth.clientId,
        status: toStatus,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("client/change-requests update-status error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update change request." }, { status: 500 });
  }
}
