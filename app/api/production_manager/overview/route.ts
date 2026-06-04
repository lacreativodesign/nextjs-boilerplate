import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import { requireProductionManagerOrAdmin, isAdminOrSuper } from "../../admin/_utils";
import { getTeamMemberIds } from "@/lib/teams/team-filter";

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
    const auth = await requireProductionManagerOrAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);

    // Resolve production team member IDs; empty means no team or admin (see all).
    const memberIds = isAdminOrSuper(auth.user.role)
      ? []
      : await getTeamMemberIds(auth.user.uid, tenantId);

    const allDocs = await queryWithTenant(
      adminDb.collection("projects").where("isDeleted", "==", false).limit(500),
      tenantId
    );

    // Scope to team members' projects when a team is assigned, otherwise all projects.
    const docs =
      memberIds.length === 0
        ? allDocs
        : allDocs.filter((doc) =>
            memberIds.includes(String(doc.data()?.productionOwnerUid || ""))
          );

    const now = new Date();
    let openProjects = 0;
    let draftsPendingReview = 0;
    let revisionsInProgress = 0;
    let overdueItems = 0;

    const queue = docs
      .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
      .sort((a, b) => {
        const aTime = toISO(a.data.updatedAt || a.data.createdAt) || "";
        const bTime = toISO(b.data.updatedAt || b.data.createdAt) || "";
        return String(bTime).localeCompare(String(aTime));
      })
      .slice(0, 15)
      .map(({ id, data }) => ({
        id,
        projectName: String(data.projectName || "Untitled"),
        stage: String(data.stage || "Draft"),
        assignedTo: String(data.productionName || data.productionOwnerName || ""),
        updatedAt: toISO(data.updatedAt || data.createdAt),
      }));

    docs.forEach((doc) => {
      const data = doc.data() || {};
      const stage = String(data.stage || "").toLowerCase();
      const isClosed = stage.includes("delivered") || stage.includes("completed");
      if (!isClosed) openProjects += 1;
      if (stage.includes("draft") || stage.includes("review")) draftsPendingReview += 1;
      if (stage.includes("revision")) revisionsInProgress += 1;
      const due = toISO(data.dueDate);
      if (due) {
        const dueDate = new Date(due);
        if (!Number.isNaN(dueDate.getTime()) && dueDate < now && !isClosed) {
          overdueItems += 1;
        }
      }
    });

    return NextResponse.json({
      ok: true,
      workload: {
        openProjects,
        draftsPendingReview,
        revisionsInProgress,
        overdueItems,
      },
      queue,
    });
  } catch (err: any) {
    console.error("production-manager overview error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load overview.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
