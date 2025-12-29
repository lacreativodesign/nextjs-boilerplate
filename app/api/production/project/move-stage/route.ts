import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, createNotificationEvent, getUserIdsByRoles } from "@/lib/notifications";
import { computeHealth, getWorkflowSettings } from "../../../admin/settings/_utils";
import { getProductionUser, isAssignedToProduction, toISO } from "../../_utils";

export const runtime = "nodejs";

const VALID_STAGES = ["Draft", "Review", "Revisions", "Final"] as const;

const ALLOWED_MOVES: Record<string, string[]> = {
  Draft: ["Review"],
  Review: ["Revisions"],
  Revisions: ["Final"],
  Final: [],
};

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
    const me = await getProductionUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const projectId = String(body?.projectId || "").trim();
    const toStage = String(body?.toStage || "").trim();

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Project id is required." }, { status: 400 });
    }

    if (!isValidStage(toStage)) {
      return NextResponse.json({ ok: false, error: "Invalid target stage." }, { status: 400 });
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

    const fromStage = isValidStage(data.stage) ? (data.stage as string) : "Draft";
    if (!canMoveStage(fromStage, toStage)) {
      return NextResponse.json({ ok: false, error: "Stage move not allowed." }, { status: 400 });
    }

    const now = admin.firestore.Timestamp.now();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    const stageHistory = Array.isArray(data.stageHistory) ? [...data.stageHistory] : [];
    stageHistory.push({
      from: fromStage,
      to: toStage,
      byUid: me.uid,
      byName: me.name || me.fullName || me.displayName || "",
      at: now,
      reason: null,
    });

    const stageTimestamps = { ...(data.stageTimestamps || {}) };
    stageTimestamps[toStage] = now;

    await ref.set(
      {
        stage: toStage,
        stageHistory,
        stageTimestamps,
        updatedAt: serverNow,
        lastActivityAt: serverNow,
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
      },
    });

    const [updatedSnap, workflowSettings] = await Promise.all([ref.get(), getWorkflowSettings()]);
    const updated = updatedSnap.data() as ProjectDoc;
    const dueDate = toISO(updated.dueDate);
    const actorName = me.name || me.fullName || me.displayName || "";

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
            title: "Project stage updated",
            body: `${updated.projectName || "Project"} moved from ${fromStage} to ${toStage}.`,
            type: "info",
            entityType: "project",
            entityId: projectId,
            deepLink: "/admin/production/queue",
            createdBy: { uid: me.uid, name: actorName },
          })
        )
    );

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

    return NextResponse.json({
      ok: true,
      project: {
        id: projectId,
        projectName: updated.projectName || "",
        clientName: updated.clientName || "",
        projectType: updated.projectType || "",
        stage: updated.stage || "Draft",
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
