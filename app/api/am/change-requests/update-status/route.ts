import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, createNotificationEvent, getUserIdsByRoles } from "@/lib/notifications";
import { getAmUser, isOwnedByAm } from "../../_utils";

export const runtime = "nodejs";

const STATUS_FLOW = ["Submitted", "In Review", "Approved", "In Progress", "Completed"] as const;
const TERMINAL_STATUSES = ["Rejected", "Completed"] as const;

type ChangeRequestDoc = {
  projectId?: string;
  status?: string;
  type?: string;
  estimatedCost?: number | null;
  estimatedTimelineDays?: number | null;
  statusHistory?: any[];
  requestedByUid?: string;
  approvalStatus?: string | null;
  isDeleted?: boolean;
};

type ProjectDoc = {
  projectName?: string;
  ownerAmUid?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  isDeleted?: boolean;
};

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

  if (fromStatus === "Approved") return toStatus === "In Progress";
  if (fromStatus === "In Progress") return toStatus === "Completed";

  return false;
}

function requiresApproval(data: ChangeRequestDoc) {
  const changeType = String(data?.type || "");
  const impactsScope = changeType === "Scope Change";
  const impactsTimeline = typeof data?.estimatedTimelineDays === "number" && data.estimatedTimelineDays > 0;
  const impactsCost = typeof data?.estimatedCost === "number" && data.estimatedCost > 0;
  return impactsScope || impactsTimeline || impactsCost;
}

export async function POST(req: Request) {
  try {
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

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

    const data = snap.data() as ChangeRequestDoc;
    if (String((data as any).tenantId || "") !== me.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const fromStatus = cleanString(data.status) || "Submitted";

    if (!canTransition(fromStatus, toStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid status transition." }, { status: 400 });
    }

    if ((toStatus === "In Progress" || toStatus === "Completed") && requiresApproval(data)) {
      if (String(data.approvalStatus || "").toLowerCase() !== "approved") {
        return NextResponse.json({ ok: false, error: "Change request approval required." }, { status: 403 });
      }
    }

    if (!data.projectId) {
      return NextResponse.json({ ok: false, error: "Change request missing project." }, { status: 400 });
    }

    const projectSnap = await adminDb.collection("projects").doc(data.projectId).get();
    if (!projectSnap.exists || projectSnap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const project = projectSnap.data() as ProjectDoc;
    if (String((project as any).tenantId || "") !== me.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (!isOwnedByAm(project, me.uid)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const now = admin.firestore.Timestamp.now();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    const statusHistory = Array.isArray(data.statusHistory) ? [...data.statusHistory] : [];
    statusHistory.push({
      from: fromStatus,
      to: toStatus,
      byUid: me.uid,
      byRole: "am",
      at: now,
      note: note || undefined,
    });

    const updateData: Record<string, any> = {
      status: toStatus,
      statusHistory,
      updatedAt: serverNow,
    };

    if (toStatus === "Completed") {
      updateData.completedAt = serverNow;
    }

    await ref.set(updateData, { merge: true });

    const adminIds = await getUserIdsByRoles(["admin", "super_admin", "sales_manager"]);
    const recipients = new Set<string>();
    adminIds.forEach((id) => recipients.add(id));
    if (data.requestedByUid) recipients.add(String(data.requestedByUid));

    const actorName = me.name || me.fullName || me.displayName || "";
    await Promise.all(
      Array.from(recipients)
        .filter(Boolean)
        .map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Change request updated",
            body: `${project.projectName || "Project"} change request moved to ${toStatus}.`,
            type: "info",
            entityType: "change_request",
            entityId: changeRequestId,
            deepLink: "/admin/projects/change-requests",
            createdBy: { uid: me.uid, name: actorName },
          })
        )
    );

    await createNotificationEvent({
      type: "change_request.updated",
      title: "Change request updated",
      description: `${project.projectName || "Project"} change request moved to ${toStatus}.`,
      entityType: "change_request",
      entityId: changeRequestId,
      createdByUid: me.uid,
      createdByName: actorName,
      metadata: {
        projectId: data.projectId,
        toStatus,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("am/change-requests update-status error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update change request right now." }, { status: 500 });
  }
}
