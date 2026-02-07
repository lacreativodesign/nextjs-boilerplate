import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import { requireAmManagerOrAdmin } from "../../admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

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

export async function GET() {
  try {
    const auth = await requireAmManagerOrAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const projects = await queryWithTenant(
      adminDb.collection("projects").where("isDeleted", "==", false).limit(500),
      tenantId
    );

    const ownedProjects = projects.filter(
      (doc) => String(doc.data()?.ownerAmUid || "") === auth.user.uid
    );
    const scopedProjects = ownedProjects.length ? ownedProjects : projects;
    const projectIds = new Set(scopedProjects.map((doc) => doc.id));

    const clientsSnap = await queryWithTenant(
      adminDb.collection("clients").where("isDeleted", "==", false).limit(500),
      tenantId
    );
    const activeClients = clientsSnap.length;

    const changeRequests = await queryWithTenant(
      adminDb.collection("changeRequests").where("isDeleted", "==", false).limit(500),
      tenantId
    );

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let changeRequestsMtd = 0;
    const atRiskProjects = new Set<string>();

    changeRequests.forEach((doc) => {
      const data = doc.data() || {};
      const projectId = String(data.projectId || "");
      if (projectIds.size && projectId && !projectIds.has(projectId)) return;
      const createdAt = toISO(data.createdAt || data.updatedAt);
      if (createdAt) {
        const createdDate = new Date(createdAt);
        if (createdDate >= startOfMonth) {
          changeRequestsMtd += 1;
        }
        if (data.internalApproved === true && createdDate < sevenDaysAgo && !["Approved", "Rejected", "Completed"].includes(String(data.status || ""))) {
          if (projectId) atRiskProjects.add(projectId);
        }
      }
    });

    scopedProjects.forEach((doc) => {
      const data = doc.data() || {};
      const status = String(data.status || "").toLowerCase();
      const health = String(data.health || "").toLowerCase();
      if (status.includes("stalled") || health.includes("at risk") || health.includes("overdue")) {
        atRiskProjects.add(doc.id);
      }
    });

    const events = await queryWithTenant(
      adminDb.collection("events").orderBy("createdAt", "desc").limit(200),
      tenantId
    );
    const escalations = events
      .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
      .filter(({ data }) => String(data.type || "").toLowerCase().includes("escalation"))
      .slice(0, 10)
      .map(({ id, data }) => ({
        id,
        title: String(data.title || "Escalation"),
        description: String(data.description || ""),
        createdAt: toISO(data.createdAt),
      }));

    return NextResponse.json({
      ok: true,
      health: {
        activeClients,
        projectsAtRisk: atRiskProjects.size,
        changeRequestsMtd,
      },
      escalations,
    });
  } catch (err: any) {
    console.error("am_manager overview error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load overview.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
