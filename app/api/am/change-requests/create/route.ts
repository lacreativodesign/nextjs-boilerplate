import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, createNotificationEvent, getUserIdsByRoles } from "@/lib/notifications";
import { getAmUser, isOwnedByAm } from "../../_utils";

export const runtime = "nodejs";

const CHANGE_REQUEST_TYPES = ["Scope Change", "Revision", "New Feature", "Bug Fix", "Other"] as const;
const CHANGE_REQUEST_PRIORITIES = ["Low", "Medium", "High"] as const;

type ProjectDoc = {
  projectName?: string;
  clientId?: string;
  clientName?: string;
  ownerAmUid?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  createdByUid?: string | null;
  isDeleted?: boolean;
};

function cleanString(value: any) {
  return String(value || "").trim();
}

async function enqueueEvent(payload: {
  changeRequestId: string;
  projectId: string;
  clientId: string;
  status: string;
  actorUid: string;
  actorRole: string;
}) {
  try {
    await adminDb.collection("eventsQueue").add({
      type: "CHANGE_REQUEST_CREATED",
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
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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

    const project = projectSnap.data() as ProjectDoc;
    if (!isOwnedByAm(project, me.uid)) {
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
      requestedByUid: me.uid,
      requestedByRole: "am",
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
          byUid: me.uid,
          byRole: "am",
          at: now,
          note: "Change request submitted",
        },
      ],
    });

    await enqueueEvent({
      changeRequestId: docRef.id,
      projectId,
      clientId: project.clientId || "",
      status: "Submitted",
      actorUid: me.uid,
      actorRole: "am",
    });

    const adminIds = await getUserIdsByRoles(["admin", "super_admin", "sales_manager"]);
    const recipients = new Set<string>();
    adminIds.forEach((id) => recipients.add(id));

    const actorName = me.name || me.fullName || me.displayName || "";
    await Promise.all(
      Array.from(recipients)
        .filter(Boolean)
        .map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Change request submitted",
            body: `${project.projectName || "Project"} has a new change request: ${title}.`,
            type: "info",
            entityType: "change_request",
            entityId: docRef.id,
            deepLink: "/admin/projects/change-requests",
            createdBy: { uid: me.uid, name: actorName },
          })
        )
    );

    await createNotificationEvent({
      type: "change_request.created",
      title: "Change request submitted",
      description: `${project.projectName || "Project"} received a change request.`,
      entityType: "change_request",
      entityId: docRef.id,
      createdByUid: me.uid,
      createdByName: actorName,
      metadata: {
        projectId,
        clientId: project.clientId || "",
      },
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err) {
    console.error("am/change-requests create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to create change request right now." }, { status: 500 });
  }
}
