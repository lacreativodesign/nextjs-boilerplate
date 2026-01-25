import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, createNotificationEvent, getUserIdsByRoles } from "@/lib/notifications";
import { computeHealth, getWorkflowSettings } from "../@/app/api/admin/settings/_utils";
import { getProductionUser, isAssignedToProduction, toISO } from "../../_utils";

export const runtime = "nodejs";

type ProjectDoc = {
  stage?: string;
  stageHistory?: Array<{ from?: string; to?: string; byUid?: string; byName?: string; at?: any; reason?: string }>;
  stageTimestamps?: Record<string, any>;
  projectName?: string;
  clientName?: string;
  projectType?: string;
  priority?: string;
  ownerAmUid?: string | null;
  ownerAmName?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  productionOwnerId?: string | null;
  productionOwnerName?: string | null;
  assignedProductionIds?: string[];
  dueDate?: any;
  updatedAt?: any;
  createdAt?: any;
  qaStatus?: string | null;
  qaNote?: string | null;
  isDeleted?: boolean;
};

function normalizeStageHistory(history?: ProjectDoc["stageHistory"]) {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => ({
    from: entry?.from || "",
    to: entry?.to || "",
    byUid: entry?.byUid || "",
    byName: entry?.byName || "",
    at: toISO(entry?.at),
    reason: entry?.reason || null,
  }));
}

async function emitAutomationEvent({
  type,
  projectId,
  actorId,
  actorName,
  payload,
}: {
  type: string;
  projectId: string;
  actorId: string;
  actorName: string;
  payload: Record<string, any>;
}) {
  await adminDb.collection("automationEvents").add({
    type,
    projectId,
    actorId,
    actorName,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    payload,
  });
}

export async function POST(req: Request) {
  try {
    const me = await getProductionUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const projectId = String(body?.projectId || "").trim();
    const action = String(body?.action || "").trim();
    const qaNotes = body?.qaNotes ? String(body.qaNotes).trim() : "";
    const note = body?.note ? String(body.note).trim() : "";

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Project id is required." }, { status: 400 });
    }

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ ok: false, error: "Invalid QA action." }, { status: 400 });
    }

    if (action === "reject" && !note) {
      return NextResponse.json({ ok: false, error: "Reason is required for QA rejection." }, { status: 400 });
    }

    const ref = adminDb.collection("projects").doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const data = snap.data() as ProjectDoc;
    if (data?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const assigned = isAssignedToProduction(
      {
        productionUid: data.productionUid ?? null,
        productionOwnerId: data.productionOwnerId ?? null,
        assignedProductionIds: data.assignedProductionIds ?? null,
      },
      me.uid
    );
    if (!assigned) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (data.stage !== "Final") {
      return NextResponse.json({ ok: false, error: "Project is not ready for QA." }, { status: 400 });
    }

    const now = admin.firestore.Timestamp.now();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();
    const actorName = me.name || me.fullName || me.displayName || "";

    const updates: Record<string, any> = {
      updatedAt: serverNow,
      lastActivityAt: serverNow,
      qaStatus: action === "approve" ? "approved" : "rejected",
      qaNote: note || null,
      qaNotes: qaNotes || null,
    };

    if (action === "approve") {
      updates.qaApprovedAt = serverNow;
      updates.qaApprovedByUid = me.uid;
      updates.qaApprovedByName = actorName;
    }

    if (action === "reject") {
      updates.qaRejectedAt = serverNow;
      updates.qaRejectedByUid = me.uid;
      updates.qaRejectedByName = actorName;

      const stageHistory = Array.isArray(data.stageHistory) ? [...data.stageHistory] : [];
      stageHistory.push({
        from: "Final",
        to: "Revisions",
        byUid: me.uid,
        byName: actorName,
        at: now,
        reason: note || null,
      });

      const stageTimestamps = { ...(data.stageTimestamps || {}) };
      stageTimestamps.Revisions = now;

      updates.stage = "Revisions";
      updates.stageHistory = stageHistory;
      updates.stageTimestamps = stageTimestamps;
    }

    await ref.set(updates, { merge: true });

    await emitAutomationEvent({
      type: action === "approve" ? "project.qa_approved" : "project.qa_rejected",
      projectId,
      actorId: me.uid,
      actorName,
      payload: {
        note: note || null,
        qaNotes: qaNotes || null,
      },
    });

    const [updatedSnap, workflowSettings] = await Promise.all([ref.get(), getWorkflowSettings()]);
    const updated = updatedSnap.data() as ProjectDoc;
    const dueDate = toISO(updated.dueDate);

    const adminIds = await getUserIdsByRoles(["admin", "super_admin"]);
    const recipients = new Set<string>();
    if (updated.ownerAmUid) recipients.add(String(updated.ownerAmUid));
    adminIds.forEach((id) => recipients.add(id));

    await Promise.all(
      Array.from(recipients)
        .filter(Boolean)
        .map((uid) =>
          createNotification({
            toUserId: uid,
            title: action === "approve" ? "QA approved" : "QA rejected",
            body:
              action === "approve"
                ? `${updated.projectName || "Project"} passed QA approval.`
                : `${updated.projectName || "Project"} was rejected in QA.`,
            type: action === "approve" ? "success" : "warning",
            entityType: "project",
            entityId: projectId,
            deepLink: "/admin/production/qa",
            createdBy: { uid: me.uid, name: actorName },
          })
        )
    );

    await createNotificationEvent({
      type: action === "approve" ? "project.qa_approved" : "project.qa_rejected",
      title: action === "approve" ? "QA approved" : "QA rejected",
      description:
        action === "approve"
          ? `${updated.projectName || "Project"} passed QA approval.`
          : `${updated.projectName || "Project"} was rejected in QA.`,
      entityType: "project",
      entityId: projectId,
      createdByUid: me.uid,
      createdByName: actorName,
      metadata: {
        qaNotes: qaNotes || null,
        note: note || null,
      },
    });

    return NextResponse.json({
      ok: true,
      project: {
        id: projectId,
        projectName: updated.projectName || "",
        clientName: updated.clientName || "",
        projectType: updated.projectType || "",
        stage: updated.stage || "Final",
        priority: updated.priority || "Normal",
        health: computeHealth(dueDate, workflowSettings.atRiskAfterDays, workflowSettings.overdueAfterDays),
        ownerAmUid: updated.ownerAmUid ?? null,
        ownerAmName: updated.ownerAmName ?? null,
        productionUid: updated.productionUid ?? updated.productionOwnerId ?? null,
        productionName: updated.productionName ?? updated.productionOwnerName ?? null,
        dueDate,
        updatedAt: toISO(updated.updatedAt),
        createdAt: toISO(updated.createdAt),
        stageHistory: normalizeStageHistory(updated.stageHistory),
      },
    });
  } catch (err: any) {
    console.error("production/qa error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to update QA status.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
