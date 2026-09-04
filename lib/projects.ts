import admin from 'firebase-admin';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { createNotification, getUserIdsByRoles } from '@/lib/notifications';
import { logEvent } from '@/lib/audit';
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from '@/lib/tenant';
import { generateNextOrderId } from '@/lib/orderIds';
import { queueEmailEvent } from './emailEvents';

const DEFAULT_KICKOFF_CHECKLIST = [
  { key: 'welcome_call', label: 'Schedule welcome call', done: false },
  { key: 'contract', label: 'Collect signed agreement', done: false },
  { key: 'assets', label: 'Request brand assets', done: false },
  { key: 'timeline', label: 'Align on timeline + milestones', done: false },
];

async function queryWithTenant(query: FirebaseFirestore.Query, tenantId: string) {
  const queries = [query.where('tenantId', '==', tenantId)];
  if (tenantId === DEFAULT_TENANT_ID) {
    queries.push(query.where('tenantId', '==', null));
  }
  const snapshots = await Promise.all(queries.map((q) => q.get()));
  const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      if (docTenantId(doc.data()) === tenantId) {
        map.set(doc.id, doc);
      }
    });
  });
  return Array.from(map.values());
}

function resolveProjectDeepLink(role: string) {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'production_manager' || normalized === 'production')
    return '/production/projects';
  if (normalized === 'am_manager' || normalized === 'am') return '/am/projects';
  if (normalized === 'client') return '/client/projects';
  return '/admin/projects';
}

async function getUserRole(uid: string) {
  const snap = await adminDb.collection('users').doc(uid).get();
  if (!snap.exists) return '';
  return String(snap.data()?.role || '');
}

function deterministicProjectId(tenantId: string, stableKey: string) {
  const digest = crypto.createHash('sha256').update(`${tenantId}:${stableKey}`).digest('hex');
  return `auto_${digest.slice(0, 40)}`;
}

export async function createProjectFromDeal({
  tenantId,
  deal,
  client,
  actor,
  stageOverride,
}: {
  tenantId?: string | null;
  deal: Record<string, any>;
  client: Record<string, any> | null;
  actor?: { uid?: string | null; name?: string | null } | null;
  stageOverride?: string | null;
}) {
  const scopedTenantId = normalizeTenantId(tenantId || deal?.tenantId || client?.tenantId);
  const dealId = String(deal?.id || deal?.dealId || '');
  const clientId = String(client?.id || client?.clientId || deal?.clientId || '');

  const existingByDeal = dealId
    ? await queryWithTenant(
        adminDb.collection('projects').where('dealId', '==', dealId).limit(1),
        scopedTenantId,
      )
    : [];

  if (existingByDeal.length) {
    return { id: existingByDeal[0].id, data: existingByDeal[0].data() };
  }

  const existingByOrder = deal?.orderId
    ? await queryWithTenant(
        adminDb.collection('projects').where('orderId', '==', deal.orderId).limit(1),
        scopedTenantId,
      )
    : [];

  if (existingByOrder.length) {
    return { id: existingByOrder[0].id, data: existingByOrder[0].data() };
  }

  const preexistingOrderId = String(deal?.orderId || client?.orderId || '');
  const orderId = preexistingOrderId || (await generateNextOrderId(scopedTenantId));
  const ownerAmUid =
    String(deal?.ownerId || client?.ownerAmUid || client?.accountManager || '') || null;
  const ownerAmName = String(deal?.ownerName || client?.ownerAmName || '') || null;
  const clientName = String(client?.companyName || deal?.clientName || deal?.leadName || 'Client');
  const projectName = String(deal?.dealName || deal?.leadName || clientName || 'New Project');

  // First-payment activation can be invoked concurrently (for example by a synchronous
  // confirmation and a Stripe webhook). Queries above preserve compatibility with older
  // random-id projects, while new auto-created projects use an atomic deterministic id.
  // Two contenders for the same deal/order therefore converge on one Firestore document.
  const stableProjectKey = dealId || preexistingOrderId;
  const projectRef = stableProjectKey
    ? adminDb.collection('projects').doc(deterministicProjectId(scopedTenantId, stableProjectKey))
    : adminDb.collection('projects').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const stage = stageOverride || 'Inquiry';
  const projectPayload = {
    tenantId: scopedTenantId,
    dealId: dealId || null,
    clientId: clientId || null,
    orderId,
    projectName,
    title: projectName,
    clientName,
    status: 'active',
    stage,
    ownerAmUid,
    ownerAmName,
    assignedAmUid: ownerAmUid,
    assignedProdUid: null,
    kickoffChecklist: DEFAULT_KICKOFF_CHECKLIST,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  };

  if (stableProjectKey) {
    try {
      await projectRef.create(projectPayload);
    } catch (error) {
      const racedProject = await projectRef.get();
      if (racedProject.exists && docTenantId(racedProject.data()) === scopedTenantId) {
        return { id: racedProject.id, data: racedProject.data() };
      }
      throw error;
    }
  } else {
    await projectRef.set(projectPayload);
  }

  await logEvent({
    tenantId: scopedTenantId,
    type: 'project.created_from_deal',
    title: 'Project created',
    description: `${projectName} created from deal ${dealId || ''}.`,
    entityType: 'project',
    entityId: projectRef.id,
    actor: actor || null,
    metadata: { dealId, clientId, orderId },
  });

  const notifyIds = new Set<string>();
  const roleIds = await getUserIdsByRoles(['production_manager', 'am_manager'], scopedTenantId);
  roleIds.forEach((id) => notifyIds.add(id));
  if (ownerAmUid) notifyIds.add(ownerAmUid);
  const portalUserUid = String(client?.portalUserUid || '');
  if (portalUserUid) notifyIds.add(portalUserUid);

  await Promise.all(
    Array.from(notifyIds).map(async (uid) => {
      const role = uid === portalUserUid ? 'client' : await getUserRole(uid);
      return createNotification({
        toUserId: uid,
        recipientRole: role || null,
        title: 'Project created',
        body: `${projectName} is ready for kickoff.`,
        type: 'project_created',
        entityType: 'project',
        entityId: projectRef.id,
        deepLink: resolveProjectDeepLink(role),
        createdBy: actor || null,
        tenantId: scopedTenantId,
        roleTarget: role || 'user',
      });
    }),
  );

  if (stage === 'Kickoff') {
    const kickoffEmail = String(
      client?.primaryContactEmail || client?.primaryContactEmailLower || client?.email || '',
    ).trim();
    if (kickoffEmail) {
      queueEmailEvent({
        templateId: 'project_kickoff',
        to: kickoffEmail,
        data: {
          clientName,
          projectName,
          orderId,
          stage,
        },
        metadata: {
          projectId: projectRef.id,
          clientId,
          tenantId: scopedTenantId,
        },
      }).catch((error) => {
        console.error('kickoff email queue error:', error);
      });
    }
  }

  return { id: projectRef.id, data: { orderId, clientName, projectName } };
}
