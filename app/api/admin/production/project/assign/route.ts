import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminOrSuper } from "../../../_utils";
import { computeHealth, getWorkflowSettings } from "../../../settings/_utils";
import { createNotification, createNotificationEvent } from "@/lib/notifications";

export const runtime = "nodejs";

async function resolveUserName(uid?: string | null) {
  if (!uid) return null;
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return (data.name || data.fullName || data.displayName || data.email || "") as string;
}

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function normalizeStageHistory(history?: any[]) {
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
    const productionUid = body?.productionUid ? String(body.productionUid).trim() : null;

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Project id is required." }, { status: 400 });
    }

    const ref = adminDb.collection("projects").doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const productionName = productionUid ? await resolveUserName(productionUid) : null;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await ref.set(
      {
        productionUid: productionUid || null,
        productionName: productionUid ? productionName || null : null,
        productionOwnerId: productionUid || null,
        productionOwnerName: productionUid ? productionName || null : null,
        updatedAt: now,
      },
      { merge: true }
    );

    await adminDb.collection("automationEvents").add({
      type: "production.assigned",
      projectId,
      actorId: me.uid,
      actorName: me.name || me.fullName || me.displayName || "",
      createdAt: now,
      payload: {
        productionUid: productionUid || null,
        productionName: productionName || null,
      },
    });

    const [updatedSnap, workflowSettings] = await Promise.all([ref.get(), getWorkflowSettings()]);
    const updated = updatedSnap.data() || {};
    const dueDate = toISO(updated.dueDate);
    const actorName = me.name || me.fullName || me.displayName || "";

    const recipients = new Set<string>();
    if (productionUid) recipients.add(productionUid);
    if (updated.ownerAmUid) recipients.add(String(updated.ownerAmUid));

    await Promise.all(
      Array.from(recipients)
        .filter(Boolean)
        .map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Project assigned to production",
            body: `${updated.projectName || "Project"} has been assigned for production.`,
            type: "info",
            entityType: "project",
            entityId: projectId,
            deepLink: "/admin/projects",
            createdBy: { uid: me.uid, name: actorName },
          })
        )
    );

    await createNotificationEvent({
      type: "production.assigned",
      title: "Project assigned to production",
      description: `${updated.projectName || "Project"} assigned to production.`,
      entityType: "project",
      entityId: projectId,
      createdByUid: me.uid,
      createdByName: actorName,
      metadata: {
        productionUid: productionUid || null,
        ownerAmUid: updated.ownerAmUid || null,
      },
    });

    return NextResponse.json({
      ok: true,
      project: {
        id: projectId,
        projectName: updated.projectName || "",
        clientName: updated.clientName || "",
        projectType: updated.projectType || "",
        stage: updated.stage || "Kickoff",
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
    console.error("production/assign error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to assign production owner.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
