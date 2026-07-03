import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  getCurrentUser,
  isAccountManager,
  isAdminOrSuper,
  isProduction,
  isSalesManager,
  normalizeRole,
} from '../../_utils';
import { createNotification, createNotificationEvent } from '@/lib/notifications';
import { logEvent } from '@/lib/audit';
import { assertPermission, Permission } from '../../../../lib/permissions';
import { dispatchZapierTriggerEvent } from '@/lib/zapier/service';

export const runtime = 'nodejs';

const LOCKED_STAGES = [
  'Deposit',
  'Kickoff',
  'Draft',
  'Review',
  'Revisions',
  'Final',
  'Delivered',
] as const;
const LEGACY_STAGE = 'Inquiry';

const ACCOUNT_MANAGER_STAGES = [
  'Kickoff',
  'Draft',
  'Review',
  'Revisions',
  'Final',
  'Delivered',
] as const;
const PRODUCTION_STAGES = ['Draft', 'Review', 'Revisions', 'Final'] as const;

function cleanString(value: any) {
  return String(value || '').trim();
}

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function normalizeStageHistory(history?: any[]) {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => ({
      from: entry?.from || '',
      to: entry?.to || '',
      byUid: entry?.byUid || '',
      byName: entry?.byName || '',
      at: toISO(entry?.at),
    }))
    .filter((entry) => entry.to || entry.from);
}

function normalizeStageTimestamps(map?: Record<string, any> | null) {
  if (!map) return {} as Record<string, string>;
  return Object.entries(map).reduce<Record<string, string>>((acc, [key, value]) => {
    const iso = toISO(value);
    if (iso) acc[key] = iso;
    return acc;
  }, {});
}

function normalizeStage(stage?: string | null) {
  if (!stage) return LEGACY_STAGE;
  if (LOCKED_STAGES.includes(stage as (typeof LOCKED_STAGES)[number])) return stage;
  return LEGACY_STAGE;
}

function isValidStage(stage: string) {
  return LOCKED_STAGES.includes(stage as (typeof LOCKED_STAGES)[number]);
}

function canMoveStage({
  role,
  project,
  fromStage,
  toStage,
  uid,
}: {
  role: string;
  project: FirebaseFirestore.DocumentData;
  fromStage: string;
  toStage: string;
  uid: string;
}) {
  if (isAdminOrSuper(role)) return true;

  if (isSalesManager(role)) {
    if (fromStage === 'Deposit' && toStage === 'Kickoff') return true;
    if (fromStage === LEGACY_STAGE && toStage === 'Deposit') return true;
    return false;
  }

  if (isAccountManager(role)) {
    const ownerUid = project.ownerAmUid || null;
    const createdByUid = project.createdByUid || null;
    const unassigned = !ownerUid;
    const canAccess = ownerUid === uid || (unassigned && createdByUid === uid);
    if (!canAccess) return false;
    if (!ACCOUNT_MANAGER_STAGES.includes(fromStage as (typeof ACCOUNT_MANAGER_STAGES)[number]))
      return false;
    return ACCOUNT_MANAGER_STAGES.includes(toStage as (typeof ACCOUNT_MANAGER_STAGES)[number]);
  }

  if (isProduction(role)) {
    if (project.productionUid !== uid) return false;
    if (!PRODUCTION_STAGES.includes(fromStage as (typeof PRODUCTION_STAGES)[number])) return false;
    return PRODUCTION_STAGES.includes(toStage as (typeof PRODUCTION_STAGES)[number]);
  }

  return false;
}

function cloneStageTimestamps(map?: Record<string, any> | null) {
  return { ...(map || {}) } as Record<string, any>;
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const projectId = cleanString(body?.projectId);
    const toStage = cleanString(body?.toStage);

    if (!projectId) {
      return NextResponse.json({ ok: false, error: 'Missing project id' }, { status: 400 });
    }

    if (!isValidStage(toStage)) {
      return NextResponse.json({ ok: false, error: 'Invalid target stage' }, { status: 400 });
    }

    const ref = adminDb.collection('projects').doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    const data = snap.data() || {};
    if (data.isDeleted) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }
    // Tenant isolation: only act on projects in the caller's tenant (super_admin exempt).
    if (
      String(me.role || '').toLowerCase() !== 'super_admin' &&
      String(data.tenantId || '') !== String(me.tenantId || '')
    ) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }
    const role = normalizeRole(me.role);
    const fromStage = normalizeStage(data.stage);

    try {
      assertPermission(role, Permission.MoveProjectStage);
    } catch {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!canMoveStage({ role, project: data, fromStage, toStage, uid: me.uid })) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const now = admin.firestore.Timestamp.now();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    const stageHistory = Array.isArray(data.stageHistory) ? [...data.stageHistory] : [];
    stageHistory.push({
      from: fromStage,
      to: toStage,
      byUid: me.uid,
      byName: me.name || me.fullName || me.displayName || '',
      at: now,
    });

    const stageTimestamps = cloneStageTimestamps(data.stageTimestamps);
    stageTimestamps[toStage] = now;

    const updateData: Record<string, any> = {
      stage: toStage,
      stageHistory,
      stageTimestamps,
      lastActivityAt: serverNow,
      updatedAt: serverNow,
    };

    if (toStage === 'Delivered') {
      updateData.deliveredAt = serverNow;
    }

    await ref.set(updateData, { merge: true });

    try {
      await adminDb.collection('eventsQueue').add({
        type: 'PROJECT_STAGE_CHANGED',
        createdAt: serverNow,
        payload: {
          projectId,
          clientId: data.clientId || '',
          toStage,
          fromStage,
          movedByUid: me.uid,
          movedByRole: role,
          timestamps: {
            movedAt: now,
          },
        },
      });
    } catch (eventError) {
      console.error('eventsQueue enqueue error:', eventError);
    }

    const updatedSnap = await ref.get();
    const updated = updatedSnap.data() || {};

    if (updated.tenantId) {
      try {
        await dispatchZapierTriggerEvent({
          tenantId: String(updated.tenantId),
          eventName: 'project.status_changed',
          entityType: 'project',
          entityId: projectId,
          payload: {
            projectId,
            fromStage,
            toStage,
            projectName: updated.projectName || null,
          },
          actor: { uid: me.uid, email: me.email || null, role: me.role || null },
        });
      } catch (error) {
        console.error('zapier project.status_changed dispatch error', error);
      }
    }

    const actorName = me.name || me.fullName || me.displayName || '';
    const notifications: Promise<void>[] = [];
    if (updated.ownerAmUid) {
      notifications.push(
        createNotification({
          toUserId: String(updated.ownerAmUid),
          title: 'Project stage updated',
          body: `${updated.projectName || 'Project'} moved from ${fromStage} to ${toStage}.`,
          type: 'info',
          entityType: 'project',
          entityId: projectId,
          deepLink: '/am/projects',
          createdBy: { uid: me.uid, name: actorName },
          roleTarget: 'am',
          tenantId: updated.tenantId || null,
        }),
      );
    }

    if (updated.productionUid) {
      notifications.push(
        createNotification({
          toUserId: String(updated.productionUid),
          title: 'Project stage updated',
          body: `${updated.projectName || 'Project'} moved from ${fromStage} to ${toStage}.`,
          type: 'info',
          entityType: 'project',
          entityId: projectId,
          deepLink: '/admin/projects',
          createdBy: { uid: me.uid, name: actorName },
          roleTarget: 'production',
          tenantId: updated.tenantId || null,
        }),
      );
    }

    await Promise.all(notifications);

    if (toStage === 'Delivered' && updated.clientId) {
      try {
        const clientSnap = await adminDb.collection('clients').doc(String(updated.clientId)).get();
        const clientData = clientSnap.exists ? clientSnap.data() || {} : {};
        const portalUid = String(clientData.portalUserUid || '');
        if (portalUid) {
          await createNotification({
            toUserId: portalUid,
            title: 'Project delivered',
            body: `${updated.projectName || 'Project'} has been delivered.`,
            type: 'success',
            entityType: 'project',
            entityId: projectId,
            deepLink: '/client/projects',
            createdBy: { uid: me.uid, name: actorName },
            roleTarget: 'client',
            tenantId: updated.tenantId || null,
          });
        }
      } catch (notifyError) {
        console.error('client delivery notification error:', notifyError);
      }
    }

    await createNotificationEvent({
      type: 'project.stage_moved',
      title: 'Project stage updated',
      description: `${updated.projectName || 'Project'} moved from ${fromStage} to ${toStage}.`,
      entityType: 'project',
      entityId: projectId,
      createdByUid: me.uid,
      createdByName: actorName,
      metadata: {
        from: fromStage,
        to: toStage,
      },
    });

    try {
      await logEvent({
        type: 'project.stage.moved',
        title: 'Project stage updated',
        description: `${updated.projectName || 'Project'} moved from ${fromStage} to ${toStage}.`,
        entityType: 'project',
        entityId: projectId,
        actor: { uid: me.uid, name: actorName },
        metadata: {
          fromStage,
          toStage,
        },
      });
    } catch (auditError) {
      console.error('audit log error:', auditError);
    }

    return NextResponse.json({
      ok: true,
      project: {
        id: projectId,
        projectCode: updated.projectCode || null,
        projectName: updated.projectName || '',
        clientId: updated.clientId || '',
        clientName: updated.clientName || '',
        projectType: updated.projectType || '',
        stage: normalizeStage(updated.stage),
        priority: updated.priority || 'Normal',
        createdByUid: updated.createdByUid || '',
        createdByName: updated.createdByName || '',
        ownerAmUid: updated.ownerAmUid ?? null,
        ownerAmName: updated.ownerAmName ?? null,
        productionUid: updated.productionUid ?? null,
        productionName: updated.productionName ?? null,
        createdAt: toISO(updated.createdAt),
        updatedAt: toISO(updated.updatedAt),
        startDate: toISO(updated.startDate),
        dueDate: toISO(updated.dueDate),
        lastActivityAt: toISO(updated.lastActivityAt),
        stageHistory: normalizeStageHistory(updated.stageHistory),
        stageTimestamps: normalizeStageTimestamps(updated.stageTimestamps),
        totalPaidUsd: Number(updated.totalPaidUsd || 0),
        outstandingUsd: Number(updated.outstandingUsd || 0),
        internalNotes: updated.internalNotes || '',
      },
    });
  } catch (err: any) {
    console.error('projects/move-stage error:', err);
    return NextResponse.json(
      { ok: false, error: 'Unable to move stage right now.' },
      { status: 500 },
    );
  }
}
