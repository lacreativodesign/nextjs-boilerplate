import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminOrSuper } from "../../../_utils";
import { computeHealth, getWorkflowSettings } from "../../../settings/_utils";
import { createNotification, createNotificationEvent, getUserIdsByRoles } from "@/lib/notifications";
import { computeSlaFields, getSlaTotalDays } from "@/lib/sla";

export const runtime = "nodejs";

const VALID_STAGES = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"] as const;

const ALLOWED_MOVES: Record<string, string[]> = {
  Kickoff: ["Draft"],
  Draft: ["Review"],
  Review: ["Revisions", "Draft"],
  Revisions: ["Review", "Final"],
  Final: ["Delivered", "Revisions"],
  Delivered: [],
};

const QA_EVENT_TYPES = ["project.qa_approved", "project.qa_rejected"] as const;

type QAEventType = (typeof QA_EVENT_TYPES)[number];

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
  dueDate?: any;
  updatedAt?: any;
  createdAt?: any;
  isDeleted?: boolean;
};

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

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

function isValidStage(stage?: string) {
  return VALID_STAGES.includes((stage || "") as (typeof VALID_STAGES)[number]);
}

function canMoveStage(fromStage: string, toStage: string) {
  return (ALLOWED_MOVES[fromStage] || []).includes(toStage);
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
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminOrSuper(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const projectId = String(body?.projectId || "").trim();
    const toStage = String(body?.toStage || "").trim();
    const reason = body?.reason ? String(body.reason).trim() : "";
    const eventType = body?.eventType ? String(body.eventType).trim() : "";

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Project id is required." }, { status: 400 });
    }

    if (!isValidStage(toStage)) {
      return NextResponse.json({ ok: false, error: "Invalid target stage." }, { status: 400 });
    }

    if (eventType && !QA_EVENT_TYPES.includes(eventType as QAEventType)) {
      return NextResponse.json({ ok: false, error: "Invalid event type." }, { status: 400 });
    }

    if (eventType === "project.qa_rejected" && !reason) {
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

    const fromStage = isValidStage(data.stage) ? (data.stage as string) : "Kickoff";
    if (!canMoveStage(fromStage, toStage)) {
      return NextResponse.json({ ok: false, error: "Stage move not allowed." }, { status: 400 });
    }

    const now = admin.firestore.Timestamp.now();
    const nowDate = now.toDate();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    const stageHistory = Array.isArray(data.stageHistory) ? [...data.stageHistory] : [];
    stageHistory.push({
      from: fromStage,
      to: toStage,
      byUid: me.uid,
      byName: me.name || me.fullName || me.displayName || "",
      at: now,
      reason: reason || null,
    });

    const stageTimestamps = { ...(data.stageTimestamps || {}) };
    stageTimestamps[toStage] = now;

    const workflowSettings = await getWorkflowSettings();
    const slaDaysTotal = getSlaTotalDays(workflowSettings.slaDaysPerStage);
    const slaFields = computeSlaFields({
      createdAt: data.createdAt,
      updatedAt: nowDate,
      stage: toStage,
      stageHistory,
      slaDaysTotal,
      now: nowDate,
    });

    await ref.set(
      {
        stage: toStage,
        stageHistory,
        stageTimestamps,
        updatedAt: serverNow,
        lastActivityAt: serverNow,
        slaDueAt: slaFields.slaDueAt ? admin.firestore.Timestamp.fromDate(slaFields.slaDueAt) : null,
        isOverdue: slaFields.isOverdue,
        daysOverdue: slaFields.daysOverdue,
      },
      { merge: true }
    );

    await emitAutomationEvent({
      type: "project.stage_moved",
      projectId,
      actorId: me.uid,
      actorName: me.name || me.fullName || me.displayName || "",
      payload: {
        from: fromStage,
        to: toStage,
        reason: reason || null,
      },
    });

    if (eventType) {
      await emitAutomationEvent({
        type: eventType,
        projectId,
        actorId: me.uid,
        actorName: me.name || me.fullName || me.displayName || "",
        payload: {
          from: fromStage,
          to: toStage,
          reason: reason || null,
          qaNotes: body?.qaNotes || null,
        },
      });
    }

    const [updatedSnap, refreshedWorkflowSettings] = await Promise.all([ref.get(), getWorkflowSettings()]);
    const updated = updatedSnap.data() as ProjectDoc;
    const dueDate = toISO(updated.dueDate);
    const actorName = me.name || me.fullName || me.displayName || "";

    const stageNotifications: Promise<void>[] = [];
    if (updated.ownerAmUid) {
      stageNotifications.push(
        createNotification({
          toUserId: String(updated.ownerAmUid),
          title: "Project stage updated",
          body: `${updated.projectName || "Project"} moved from ${fromStage} to ${toStage}.`,
          type: "info",
          entityType: "project",
          entityId: projectId,
          deepLink: "/am/projects",
          createdBy: { uid: me.uid, name: actorName },
        })
      );
    }

    const productionRecipient = updated.productionUid || updated.productionOwnerId;
    if (productionRecipient) {
      stageNotifications.push(
        createNotification({
          toUserId: String(productionRecipient),
          title: "Project stage updated",
          body: `${updated.projectName || "Project"} moved from ${fromStage} to ${toStage}.`,
          type: "info",
          entityType: "project",
          entityId: projectId,
          deepLink: "/admin/projects",
          createdBy: { uid: me.uid, name: actorName },
        })
      );
    }

    await Promise.all(stageNotifications);

    await createNotificationEvent({
      type: "project.stage_moved",
      title: "Project stage updated",
      description: `${updated.projectName || "Project"} moved from ${fromStage} to ${toStage}.`,
      entityType: "project",
      entityId: projectId,
      createdByUid: me.uid,
      createdByName: actorName,
      metadata: {
        from: fromStage,
        to: toStage,
      },
    });

    if (eventType === "project.qa_approved" || eventType === "project.qa_rejected") {
      const adminIds = await getUserIdsByRoles(["admin", "super_admin"]);
      const qaNotifications: Promise<void>[] = [];

      if (updated.ownerAmUid) {
        qaNotifications.push(
          createNotification({
            toUserId: String(updated.ownerAmUid),
            title: eventType === "project.qa_approved" ? "QA approved" : "QA rejected",
            body:
              eventType === "project.qa_approved"
                ? `${updated.projectName || "Project"} passed QA approval.`
                : `${updated.projectName || "Project"} was rejected in QA.`,
            type: eventType === "project.qa_approved" ? "success" : "warning",
            entityType: "project",
            entityId: projectId,
            deepLink: "/am/projects",
            createdBy: { uid: me.uid, name: actorName },
          })
        );
      }

      adminIds.forEach((uid) => {
        if (!uid) return;
        qaNotifications.push(
          createNotification({
            toUserId: uid,
            title: eventType === "project.qa_approved" ? "QA approved" : "QA rejected",
            body:
              eventType === "project.qa_approved"
                ? `${updated.projectName || "Project"} passed QA approval.`
                : `${updated.projectName || "Project"} was rejected in QA.`,
            type: eventType === "project.qa_approved" ? "success" : "warning",
            entityType: "project",
            entityId: projectId,
            deepLink: "/admin/production/qa",
            createdBy: { uid: me.uid, name: actorName },
          })
        );
      });

      await Promise.all(qaNotifications);

      await createNotificationEvent({
        type: eventType,
        title: eventType === "project.qa_approved" ? "QA approved" : "QA rejected",
        description:
          eventType === "project.qa_approved"
            ? `${updated.projectName || "Project"} passed QA approval.`
            : `${updated.projectName || "Project"} was rejected in QA.`,
        entityType: "project",
        entityId: projectId,
        createdByUid: me.uid,
        createdByName: actorName,
        metadata: { qaNotes: body?.qaNotes || null },
      });
    }

    return NextResponse.json({
      ok: true,
      project: {
        id: projectId,
        projectName: updated.projectName || "",
        clientName: updated.clientName || "",
        projectType: updated.projectType || "",
        stage: updated.stage || "Kickoff",
        priority: updated.priority || "Normal",
        health: computeHealth(
          dueDate,
          refreshedWorkflowSettings.atRiskAfterDays,
          refreshedWorkflowSettings.overdueAfterDays
        ),
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
    console.error("production/move-stage error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to move stage.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
