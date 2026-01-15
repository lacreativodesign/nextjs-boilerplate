import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import { generateNextOrderId } from "@/lib/orderIds";

const DEFAULT_KICKOFF_CHECKLIST = [
  { key: "welcome_call", label: "Schedule welcome call", done: false },
  { key: "contract", label: "Collect signed agreement", done: false },
  { key: "assets", label: "Request brand assets", done: false },
  { key: "timeline", label: "Align on timeline + milestones", done: false },
];

async function queryWithTenant(query: FirebaseFirestore.Query, tenantId: string) {
  const queries = [query.where("tenantId", "==", tenantId)];
  if (tenantId === DEFAULT_TENANT_ID) {
    queries.push(query.where("tenantId", "==", null));
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
  const normalized = String(role || "").toLowerCase();
  if (normalized === "production_manager" || normalized === "production") return "/production/projects";
  if (normalized === "am_manager" || normalized === "account_manager") return "/am/projects";
  if (normalized === "client") return "/client/projects";
  return "/admin/projects";
}

async function getUserRole(uid: string) {
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return "";
  return String(snap.data()?.role || "");
}

export async function createProjectFromDeal({
  tenantId,
  deal,
  client,
  actor,
}: {
  tenantId?: string | null;
  deal: Record<string, any>;
  client: Record<string, any> | null;
  actor?: { uid?: string | null; name?: string | null } | null;
}) {
  const scopedTenantId = normalizeTenantId(tenantId || deal?.tenantId || client?.tenantId);
  const dealId = String(deal?.id || deal?.dealId || "");
  const clientId = String(client?.id || client?.clientId || deal?.clientId || "");

  const existingByDeal = dealId
    ? await queryWithTenant(adminDb.collection("projects").where("dealId", "==", dealId).limit(1), scopedTenantId)
    : [];

  if (existingByDeal.length) {
    return { id: existingByDeal[0].id, data: existingByDeal[0].data() };
  }

  const existingByOrder = deal?.orderId
    ? await queryWithTenant(adminDb.collection("projects").where("orderId", "==", deal.orderId).limit(1), scopedTenantId)
    : [];

  if (existingByOrder.length) {
    return { id: existingByOrder[0].id, data: existingByOrder[0].data() };
  }

  const orderId = String(deal?.orderId || client?.orderId || "") || (await generateNextOrderId());
  const ownerAmUid = String(deal?.ownerId || client?.ownerAmUid || client?.accountManager || "") || null;
  const ownerAmName = String(deal?.ownerName || client?.ownerAmName || "") || null;
  const clientName = String(client?.companyName || deal?.clientName || deal?.leadName || "Client");
  const projectName = String(deal?.dealName || deal?.leadName || clientName || "New Project");

  const projectRef = adminDb.collection("projects").doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  await projectRef.set({
    tenantId: scopedTenantId,
    dealId: dealId || null,
    clientId: clientId || null,
    orderId,
    projectName,
    title: projectName,
    clientName,
    status: "active",
    stage: "Inquiry",
    ownerAmUid,
    ownerAmName,
    assignedAmUid: ownerAmUid,
    assignedProdUid: null,
    kickoffChecklist: DEFAULT_KICKOFF_CHECKLIST,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  });

  await logEvent({
    tenantId: scopedTenantId,
    type: "project.created_from_deal",
    title: "Project created",
    description: `${projectName} created from deal ${dealId || ""}.`,
    entityType: "project",
    entityId: projectRef.id,
    actor: actor || null,
    metadata: { dealId, clientId, orderId },
  });

  const notifyIds = new Set<string>();
  const roleIds = await getUserIdsByRoles(["production_manager", "am_manager"], scopedTenantId);
  roleIds.forEach((id) => notifyIds.add(id));
  if (ownerAmUid) notifyIds.add(ownerAmUid);
  const portalUserUid = String(client?.portalUserUid || "");
  if (portalUserUid) notifyIds.add(portalUserUid);

  await Promise.all(
    Array.from(notifyIds).map(async (uid) => {
      const role = uid === portalUserUid ? "client" : await getUserRole(uid);
      return createNotification({
        toUserId: uid,
        title: "Project created",
        body: `${projectName} is ready for kickoff.`,
        type: "info",
        entityType: "project",
        entityId: projectRef.id,
        deepLink: resolveProjectDeepLink(role),
        createdBy: actor || null,
        tenantId: scopedTenantId,
      });
    })
  );

  return { id: projectRef.id, data: { orderId, clientName, projectName } };
}
