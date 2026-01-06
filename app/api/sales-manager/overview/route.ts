import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSalesManager, toISO } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = auth.user.tenantId || "";
    const [leadsSnap, dealsSnap, eventsSnap] = await Promise.all([
      adminDb.collection("leads").where("tenantId", "==", tenantId).where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("deals").where("tenantId", "==", tenantId).where("isDeleted", "==", false).limit(500).get(),
      adminDb
        .collection("events")
        .where("entityType", "in", ["lead", "deal", "follow_up", "payment_request"])
        .limit(200)
        .get(),
    ]);

    const leads = leadsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const deals = dealsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const newLeads30d = leads.filter((lead: any) => {
      const createdAt = toISO(lead.createdAt || lead.updatedAt);
      if (!createdAt) return false;
      const created = new Date(createdAt);
      return created >= thirtyDaysAgo;
    }).length;

    const qualifiedLeads = leads.filter((lead: any) => String(lead.stage || "").toLowerCase() === "qualified").length;

    const activeDeals = deals.filter((deal: any) => !String(deal.stage || "").toLowerCase().includes("closed")).length;

    const closedWonDeals = deals.filter((deal: any) => String(deal.stage || "") === "Closed Won");
    const closedWonMonth = closedWonDeals.filter((deal: any) => {
      const closedAt = toISO(deal.closedWonAt || deal.updatedAt || deal.createdAt);
      if (!closedAt) return false;
      const closed = new Date(closedAt);
      return closed >= startOfMonth;
    });

    const revenueClosed = closedWonMonth.reduce((sum: number, deal: any) => sum + Number(deal.valueUsd || 0), 0);

    const stageMap = new Map<string, { stage: string; count: number; value: number }>();
    deals.forEach((deal: any) => {
      const stage = String(deal.stage || "New Lead");
      const entry = stageMap.get(stage) || { stage, count: 0, value: 0 };
      entry.count += 1;
      entry.value += Number(deal.valueUsd || 0);
      stageMap.set(stage, entry);
    });

    const ownerMap = new Map<string, { ownerName: string; deals: number; value: number; wins: number; total: number }>();
    deals.forEach((deal: any) => {
      const ownerName = String(deal.ownerName || "Unassigned");
      const entry = ownerMap.get(ownerName) || { ownerName, deals: 0, value: 0, wins: 0, total: 0 };
      entry.deals += 1;
      entry.total += 1;
      entry.value += Number(deal.valueUsd || 0);
      if (String(deal.stage || "") === "Closed Won") {
        entry.wins += 1;
      }
      ownerMap.set(ownerName, entry);
    });

    const topReps = Array.from(ownerMap.values())
      .map((rep) => ({
        ownerName: rep.ownerName,
        deals: rep.deals,
        value: rep.value,
        winRate: rep.total ? (rep.wins / rep.total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const recentActivity = eventsSnap.docs
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
      },
      pipelineStages: Array.from(stageMap.values()),
      topReps,
      recentActivity,
    });
  } catch (err: any) {
    console.error("sales manager overview error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load overview.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
