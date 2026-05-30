import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import { requireSalesManager, toISO } from "../_utils";

export const dynamic = "force-dynamic";

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
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId as string | null | undefined);
    const [leadsSnap, dealsSnap, eventsSnap] = await Promise.all([
      queryWithTenant(adminDb.collection("leads").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("deals").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(
        adminDb.collection("events").where("entityType", "in", ["lead", "deal", "follow_up"]).limit(200),
        tenantId
      ),
    ]);

    const leads = leadsSnap.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const deals = dealsSnap.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const newLeads30d = leads.filter((lead: unknown) => {
      const createdAt = toISO((lead as Record<string, unknown>).createdAt || (lead as Record<string, unknown>).updatedAt);
      if (!createdAt) return false;
      const created = new Date(createdAt);
      return created >= thirtyDaysAgo;
    }).length;

    const qualifiedLeads = leads.filter((lead: unknown) => String((lead as Record<string, unknown>).stage || "").toLowerCase() === "qualified").length;

    const activeDeals = deals.filter((deal: unknown) => !String((deal as Record<string, unknown>).stage || "").toLowerCase().includes("closed")).length;

    const closedWonDeals = deals.filter((deal: unknown) => String((deal as Record<string, unknown>).stage || "") === "Closed Won");
    const closedWonMonth = closedWonDeals.filter((deal: unknown) => {
      const closedAt = toISO((deal as Record<string, unknown>).closedWonAt || (deal as Record<string, unknown>).updatedAt || (deal as Record<string, unknown>).createdAt);
      if (!closedAt) return false;
      const closed = new Date(closedAt);
      return closed >= startOfMonth;
    });

    const revenueClosed = closedWonMonth.reduce(
      (sum: number, deal: unknown) => sum + Number((deal as Record<string, unknown>).finalPriceUsd || (deal as Record<string, unknown>).valueUsd || 0),
      0
    );

    const dealsCreatedMtd = deals.filter((deal: unknown) => {
      const createdAt = toISO((deal as Record<string, unknown>).createdAt || (deal as Record<string, unknown>).updatedAt);
      if (!createdAt) return false;
      const created = new Date(createdAt);
      return created >= startOfMonth;
    }).length;

    const discountPending = deals.filter(
      (deal: unknown) => String((deal as Record<string, unknown>).discountStatus || "").toLowerCase() === "pending"
    );
    const discountDeals = deals.filter((deal: unknown) => Number((deal as Record<string, unknown>).discountPct || 0) > 0);
    const avgDiscountPct = discountDeals.length
      ? discountDeals.reduce((sum: number, deal: unknown) => sum + Number((deal as Record<string, unknown>).discountPct || 0), 0) / discountDeals.length
      : 0;

    const stageMap = new Map<string, { stage: string; count: number; value: number }>();
    deals.forEach((deal: unknown) => {
      const stage = String((deal as Record<string, unknown>).stage || "New Lead");
      const entry = stageMap.get(stage) || { stage, count: 0, value: 0 };
      entry.count += 1;
      entry.value += Number((deal as Record<string, unknown>).valueUsd || 0);
      stageMap.set(stage, entry);
    });

    const ownerMap = new Map<
      string,
      { ownerName: string; wonRevenue: number; wonCount: number; discountSum: number; discountCount: number }
    >();
    deals.forEach((deal: unknown) => {
      if (String((deal as Record<string, unknown>).stage || "") !== "Closed Won") return;
      const ownerName = String((deal as Record<string, unknown>).ownerName || "Unassigned");
      const entry = ownerMap.get(ownerName) || {
        ownerName,
        wonRevenue: 0,
        wonCount: 0,
        discountSum: 0,
        discountCount: 0,
      };
      entry.wonCount += 1;
      entry.wonRevenue += Number((deal as Record<string, unknown>).finalPriceUsd || (deal as Record<string, unknown>).valueUsd || 0);
      const discountPct = Number((deal as Record<string, unknown>).discountPct || 0);
      if (discountPct > 0) {
        entry.discountSum += discountPct;
        entry.discountCount += 1;
      }
      ownerMap.set(ownerName, entry);
    });

    const topReps = Array.from(ownerMap.values())
      .map((rep) => ({
        ownerName: rep.ownerName,
        wonRevenue: rep.wonRevenue,
        wonCount: rep.wonCount,
        avgDiscountPct: rep.discountCount ? rep.discountSum / rep.discountCount : 0,
      }))
      .sort((a, b) => b.wonRevenue - a.wonRevenue)
      .slice(0, 5);

    const recentActivity = eventsSnap
      .map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          title: String(data.title || "Sales update"),
          description: String(data.description || ""),
          createdAt: toISO(data.createdAt),
        };
      })
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 6);

    return NextResponse.json({
      ok: true,
      kpis: {
        newLeads30d,
        qualifiedLeads,
        activeDeals,
        closedWonMonth: closedWonMonth.length,
        revenueClosed,
        dealsCreatedMtd,
        discountPendingCount: discountPending.length,
        avgDiscountPct,
      },
      pipelineStages: Array.from(stageMap.values()),
      topReps,
      recentActivity,
    });
  } catch (err) {
    console.error("sales manager overview error:", err);
    const rawMessage = String((err instanceof Error ? err.message : undefined) || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load overview.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
