import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, normalizeRole } from "@/app/api/admin/_utils";
import { normalizeDeliveryStatus } from "@/lib/projects";

export const PROJECT_ROLES = ["admin", "super_admin", "am", "production", "client"] as const;

export function canAccessProjects(role: string) {
  return PROJECT_ROLES.includes(normalizeRole(role) as any);
}

export function mapProject(docId: string, data: Record<string, any>) {
  return {
    id: docId,
    title: String(data.title || data.projectName || "Untitled Project"),
    clientId: String(data.clientId || ""),
    dealId: String(data.dealId || ""),
    status: normalizeDeliveryStatus(data.status || data.statusPipeline || data.stage),
    assignedAM: String(data.assignedAM || data.assignedAmUid || data.ownerAmUid || "") || null,
    assignedProduction: String(data.assignedProduction || data.assignedProdUid || data.productionUid || "") || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function requireProjectUser() {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, status: 401, error: "Unauthorized" };
  const role = normalizeRole(me.role || "");
  if (!canAccessProjects(role || "")) return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, user: { ...me, role } };
}

export async function resolveClientIdFromUser(user: Record<string, any>) {
  const explicit = String(user.clientId || "").trim();
  if (explicit) return explicit;
  const uid = String(user.uid || "");
  if (!uid) return "";
  const snap = await adminDb.collection("clients").where("portalUserUid", "==", uid).limit(1).get();
  if (!snap.empty) return snap.docs[0].id;
  return "";
}

export function canReadProject(project: ReturnType<typeof mapProject>, user: Record<string, any>) {
  const role = normalizeRole(user.role || "");
  if (role === "admin" || role === "super_admin") return true;
  if (role === "am") return project.assignedAM === user.uid;
  if (role === "production") return project.assignedProduction === user.uid;
  if (role === "client") return project.clientId === user.clientId;
  return false;
}
