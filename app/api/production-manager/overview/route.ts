import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import { requireProductionManagerOrAdmin } from "../../admin/_utils";
import { getWorkflowSettings } from "../../admin/settings/_utils";
import { computeSlaFields, getSlaTotalDays } from "@/lib/sla";

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
    const [docs, workflowSettings, eventsSnap] = await Promise.all([
      queryWithTenant(adminDb.collection("projects").where("isDeleted", "==", false).limit(500), tenantId),
      getWorkflowSettings(),
      queryWithTenant(adminDb.collection("events").orderBy("createdAt", "desc").limit(200), tenantId),
    ]);

    const now = new Date();
    let openProjects = 0;
    let draftsPendingReview = 0;
    let revisionsInProgress = 0;
    let overdueItems = 0;

    const slaDaysTotal = getSlaTotalDays(workflowSettings.slaDaysPerStage);
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

    let deliveredCount = 0;
    let deliveredOnTime = 0;
    let deliveryDaysSum = 0;
    let slaOverdueCount = 0;
    const agingBuckets = { "0-2": 0, "3-7": 0, "7+": 0 };
    const workloadByOwner = new Map<string, number>();

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

      const slaFields = computeSlaFields({
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        stage: String(data.stage || ""),
        stageHistory: data.stageHistory || [],
        slaDaysTotal,
      });

      if (String(data.stage || "") === "Delivered") {
        deliveredCount += 1;
        if (!slaFields.isOverdue) deliveredOnTime += 1;
        if (typeof slaFields.activeDays === "number") deliveryDaysSum += slaFields.activeDays;
      } else if (slaFields.isOverdue) {
        slaOverdueCount += 1;
        if (slaFields.daysOverdue <= 2) agingBuckets["0-2"] += 1;
        else if (slaFields.daysOverdue <= 7) agingBuckets["3-7"] += 1;
        else agingBuckets["7+"] += 1;
      }

      const owner = String(data.productionName || data.productionOwnerName || "Unassigned");
      if (!isClosed) workloadByOwner.set(owner, (workloadByOwner.get(owner) || 0) + 1);
    });

    const escalations = eventsSnap
      .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
      .filter(({ data }) => String(data.type || "").toLowerCase().includes("escalation"))
      .slice(0, 6)
      .map(({ id, data }) => ({
        id,
        title: String(data.title || "Escalation"),
        description: String(data.description || ""),
        createdAt: toISO(data.createdAt),
      }));

    const teamWorkload = Array.from(workloadByOwner.entries())
      .map(([name, activeProjects]) => ({ name, activeProjects }))
      .sort((a, b) => b.activeProjects - a.activeProjects)
      .slice(0, 6);

    const onTimePct = deliveredCount ? Math.round((deliveredOnTime / deliveredCount) * 100) : 0;
    const avgDeliveryDays = deliveredCount ? Number((deliveryDaysSum / deliveredCount).toFixed(1)) : 0;

    return NextResponse.json({
      ok: true,
      workload: {
        openProjects,
        draftsPendingReview,
        revisionsInProgress,
        overdueItems,
      },
      queue,
      sla: {
        onTimePct,
        avgDeliveryDays,
        overdueCount: slaOverdueCount,
        agingBuckets,
      },
      teamWorkload,
      escalations,
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
