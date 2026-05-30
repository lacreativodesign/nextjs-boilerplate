import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, toISO } from "../_utils";
import { normalizeTenantId } from "@/lib/tenant";
import { queryWithTenant } from "@/lib/tenant/query";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId as string | null | undefined);
    const [leadDocs, dealDocs, eventDocs] = await Promise.all([
      queryWithTenant(adminDb.collection("leads").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("deals").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(
        adminDb.collection("events").where("entityType", "in", ["lead", "deal", "follow_up"]).limit(200),
        tenantId
      ),
    ]);

    const leads = leadDocs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const deals = dealDocs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

    const totalLeads = leads.length;
    const activeDeals = deals.filter((deal: unknown) => !String((deal as Record<string, unknown>).stage || "").toLowerCase().includes("closed")).length;
    const pipelineValue = deals
      .filter((deal: unknown) => !String((deal as Record<string, unknown>).stage || "").toLowerCase().includes("closed"))
      .reduce((sum: number, deal: unknown) => sum + Number((deal as Record<string, unknown>).valueUsd || 0), 0);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const closedWonThisMonth = deals.filter((deal: unknown) => {
      const stage = String((deal as Record<string, unknown>).stage || "");
      if (stage !== "Closed Won") return false;
      const closedAt = (deal as Record<string, unknown>).closedWonAt || (deal as Record<string, unknown>).updatedAt || (deal as Record<string, unknown>).createdAt;
      const iso = toISO(closedAt);
      if (!iso) return false;
      const d = new Date(iso);
      return d >= startOfMonth;
    }).length;

    const closedWonTotal = deals.filter((deal: unknown) => String((deal as Record<string, unknown>).stage || "") === "Closed Won").length;
    const conversionRate = totalLeads ? (closedWonTotal / totalLeads) * 100 : 0;

    const stageMap = new Map<string, { stage: string; count: number; value: number }>();
    deals.forEach((deal: unknown) => {
      const stage = String((deal as Record<string, unknown>).stage || "New");
      const entry = stageMap.get(stage) || { stage, count: 0, value: 0 };
      entry.count += 1;
      entry.value += Number((deal as Record<string, unknown>).valueUsd || 0);
      stageMap.set(stage, entry);
    });

    const ownerMap = new Map<string, { ownerName: string; deals: number; value: number }>();
    deals.forEach((deal: unknown) => {
      const ownerName = String((deal as Record<string, unknown>).ownerName || "Unassigned");
      const entry = ownerMap.get(ownerName) || { ownerName, deals: 0, value: 0 };
      entry.deals += 1;
      entry.value += Number((deal as Record<string, unknown>).valueUsd || 0);
      ownerMap.set(ownerName, entry);
    });

    const recentActivity = eventDocs
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
        totalLeads,
        activeDeals,
        pipelineValue,
        closedWonMonth: closedWonThisMonth,
        conversionRate,
      },
      pipelineStages: Array.from(stageMap.values()),
      topOwners: Array.from(ownerMap.values()).sort((a, b) => b.value - a.value).slice(0, 5),
      recentActivity,
    });
  } catch (err) {
    console.error("sales overview error:", err);
    const rawMessage = String((err instanceof Error ? err.message : undefined) || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load overview.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
