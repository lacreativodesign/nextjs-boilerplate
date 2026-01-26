import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, createNotificationEvent, getUserIdsByRoles } from "@/lib/notifications";
import { computeHealth, getWorkflowSettings } from "../../../admin/_shared";
import { getAmUser, isOwnedByAm, toISO } from "../../_utils";
import { logEvent } from "@/lib/audit";
import { assertPermission, Permission } from "../../lib/permissions";

export const runtime = "nodejs";

const VALID_STAGES = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"] as const;

type ProjectDoc = {
  projectName?: string;
  clientName?: string;
  stage?: string;
  priority?: string;
  dueDate?: any;
  stageHistory?: Array<{ from?: string; to?: string; byUid?: string; byName?: string; at?: any; reason?: string }>;
  stageTimestamps?: Record<string, any>;
  ownerAmUid?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  updatedAt?: any;
  isDeleted?: boolean;
};

function cleanString(value: any) {
  return String(value || "").trim();
}

function normalizeStage(stage?: string) {
  return VALID_STAGES.includes((stage || "") as (typeof VALID_STAGES)[number]) ? (stage as string) : "Kickoff";
}

export async function POST(req: Request) {
  try {
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
      assertPermission(me.role, Permission.MoveProjectStage);
    } catch {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const projectId = cleanString(body?.projectId);
    const toStage = cleanString(body?.toStage);
    const note = cleanString(body?.note);

    if (!projectId || !toStage) {
      return NextResponse.json({ ok: false, error: "Missing stage update data." }, { status: 400 });
    }

    if (!VALID_STAGES.includes(toStage as (typeof VALID_STAGES)[number])) {
      return NextResponse.json({ ok: false, error: "Invalid stage." }, { status: 400 });
    }

    const ref = adminDb.collection("projects").doc(projectId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const data = snap.data() as ProjectDoc;
    if (!isOwnedByAm(data, me.uid)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const fromStage = normalizeStage(data.stage);
    if (!(fromStage === "Kickoff" && toStage === "Draft")) {
      return NextResponse.json({ ok: false, error: "Invalid stage transition." }, { status: 400 });
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
      reason: note || null,
    });

    const stageTimestamps = { ...(data.stageTimestamps || {}) };
    stageTimestamps[toStage] = now;

    await ref.set(
      {
        stage: toStage,
        stageHistory,
        stageTimestamps,
        updatedAt: serverNow,
      },
      { merge: true }
    );

    const [updatedSnap, workflowSettings] = await Promise.all([ref.get(), getWorkflowSettings()]);
    const updated = updatedSnap.data() as ProjectDoc;
    const dueDate = toISO((updated as any)?.dueDate);
    const health = computeHealth(dueDate, workflowSettings.atRiskAfterDays, workflowSettings.overdueAfterDays);

    const actorName = me.name || me.fullName || me.displayName || "";
    const adminIds = await getUserIdsByRoles(["admin", "super_admin"]);
    const recipients = new Set<string>();
    if (updated.productionUid) recipients.add(String(updated.productionUid));
    adminIds.forEach((id) => recipients.add(id));

    await Promise.all(
      Array.from(recipients)
        .filter(Boolean)
        .map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Stage moved",
            body: `${updated.projectName || "Project"} moved from ${fromStage} to ${toStage}.`,
            type: "info",
            entityType: "project",
            entityId: projectId,
            deepLink: "/admin/projects",
            createdBy: { uid: me.uid, name: actorName },
          })
        )
    );

    await createNotificationEvent({
      type: "project.stage.moved",
      title: "Stage moved",
      description: `${updated.projectName || "Project"} moved from ${fromStage} to ${toStage}.`,
      entityType: "project",
      entityId: projectId,
      createdByUid: me.uid,
      createdByName: actorName,
      metadata: {
        fromStage,
        toStage,
      },
    });

    try {
      await logEvent({
        type: "project.stage.moved",
        title: "Stage moved",
        description: `${updated.projectName || "Project"} moved from ${fromStage} to ${toStage}.`,
        entityType: "project",
        entityId: projectId,
        actor: { uid: me.uid, name: actorName },
        metadata: {
          fromStage,
          toStage,
        },
      });
    } catch (auditError) {
      console.error("audit log error:", auditError);
    }

    return NextResponse.json({
      ok: true,
      project: {
        id: projectId,
        projectName: updated.projectName || "",
        clientName: updated.clientName || "",
        stage: normalizeStage(updated.stage),
        priority: updated.priority || "Normal",
        health,
        dueDate,
        ownerAmUid: updated.ownerAmUid ?? null,
        productionUid: updated.productionUid ?? null,
        productionName: updated.productionName ?? null,
        updatedAt: toISO(updated.updatedAt),
        createdAt: null,
        stageHistory: (updated.stageHistory || []).map((entry) => ({
          from: entry?.from || "",
          to: entry?.to || "",
          byUid: entry?.byUid || "",
          byName: entry?.byName || "",
          at: toISO(entry?.at),
          reason: entry?.reason || null,
        })),
      },
    });
  } catch (err: any) {
    console.error("am/move-stage error:", err);
    return NextResponse.json({ ok: false, error: "Unable to move stage right now." }, { status: 500 });
  }
}
