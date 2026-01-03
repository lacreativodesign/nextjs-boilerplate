import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireClient } from "../../_utils";
import { createNotification, createNotificationEvent, getUserIdsByRoles } from "@/lib/notifications";

export const runtime = "nodejs";

const CHANGE_REQUEST_TYPES = ["Scope Change", "Revision", "New Feature", "Bug Fix", "Other"] as const;
const CHANGE_REQUEST_PRIORITIES = ["Low", "Medium", "High"] as const;

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
    const projectId = cleanString(body?.projectId);
    const type = cleanString(body?.type);
    const title = cleanString(body?.title);
    const description = cleanString(body?.description);
    const priority = cleanString(body?.priority) || "Medium";
    const attachedFileIds = Array.isArray(body?.attachedFileIds)
      ? body.attachedFileIds.map((id: any) => cleanString(id)).filter(Boolean)
      : [];

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Project is required." }, { status: 400 });
    }

    if (!CHANGE_REQUEST_TYPES.includes(type as (typeof CHANGE_REQUEST_TYPES)[number])) {
      return NextResponse.json({ ok: false, error: "Invalid change request type." }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ ok: false, error: "Title is required." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ ok: false, error: "Description is required." }, { status: 400 });
    }

    if (!CHANGE_REQUEST_PRIORITIES.includes(priority as (typeof CHANGE_REQUEST_PRIORITIES)[number])) {
      return NextResponse.json({ ok: false, error: "Invalid priority." }, { status: 400 });
    }

    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists || projectSnap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const project = projectSnap.data() || {};
    if (String(project.clientId || "") !== auth.clientId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const now = admin.firestore.Timestamp.now();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    const docRef = await adminDb.collection("changeRequests").add({
      projectId,
      projectName: project.projectName || "",
      clientId: project.clientId || "",
      clientName: project.clientName || "",
      type,
      title,
      description,
      status: "Submitted",
      priority,
      requestedByUid: auth.user.uid,
      requestedByRole: "client",
      assignedToUid: null,
      assignedToRole: null,
      estimatedCost: null,
      estimatedTimelineDays: null,
      approvedAt: null,
      approvedByUid: null,
      attachedFileIds,
      createdAt: serverNow,
      updatedAt: serverNow,
      completedAt: null,
      isDeleted: false,
      statusHistory: [
        {
          from: "",
          to: "Submitted",
          byUid: auth.user.uid,
          byRole: "client",
          at: now,
          note: "Change request submitted by client.",
        },
      ],
    });

    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
    const notifications: Promise<void>[] = [];
    if (project.ownerAmUid) {
      notifications.push(
        createNotification({
          toUserId: String(project.ownerAmUid),
          title: "Client change request",
          body: `${project.projectName || "Project"} has a new change request: ${title}.`,
          type: "info",
          entityType: "change_request",
          entityId: docRef.id,
          deepLink: "/am/change-requests",
          createdBy: { uid: auth.user.uid, name: actorName },
        })
      );
    }

    const adminIds = await getUserIdsByRoles(["admin", "super_admin"]);
    adminIds.forEach((uid) => {
      notifications.push(
        createNotification({
          toUserId: uid,
          title: "Client change request",
          body: `${project.projectName || "Project"} has a new change request: ${title}.`,
          type: "info",
          entityType: "change_request",
          entityId: docRef.id,
          deepLink: "/admin/projects/change-requests",
          createdBy: { uid: auth.user.uid, name: actorName },
        })
      );
    });

    await Promise.all(notifications);

    await createNotificationEvent({
      type: "change_request.client_created",
      title: "Client change request",
      description: `${project.projectName || "Project"} received a client change request.`,
      entityType: "change_request",
      entityId: docRef.id,
      createdByUid: auth.user.uid,
      createdByName: actorName,
      metadata: {
        projectId,
        clientId: auth.clientId,
      },
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error("client/change-requests create error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to create change request.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
