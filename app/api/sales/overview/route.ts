import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  canWriteSales,
  getWatcherUserIds,
  isSales,
  normalizeStage,
  requireSalesRead,
  toISO,
} from "../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const role = auth.user.role || "";
    const isSalesRep = isSales(role);

    const [leadOwnerSnap, leadCreatorSnap] = isSalesRep
      ? await Promise.all([
          adminDb.collection("leads").where("isDeleted", "==", false).where("ownerId", "==", auth.user.uid).limit(500).get(),
          adminDb.collection("leads").where("isDeleted", "==", false).where("createdBy", "==", auth.user.uid).limit(500).get(),
        ])
      : await Promise.all([
          adminDb.collection("leads").where("isDeleted", "==", false).limit(500).get(),
          Promise.resolve(null),
        ]);

    const leadDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    leadOwnerSnap.docs.forEach((doc) => leadDocs.set(doc.id, doc));
    if (leadCreatorSnap) {
      leadCreatorSnap.docs.forEach((doc) => leadDocs.set(doc.id, doc));
    }

    const leads = Array.from(leadDocs.values()).map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const leadIds = new Set(leads.map((lead: any) => String(lead.id)));

    const dealQueries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
    if (isSalesRep) {
      dealQueries.push(
        adminDb.collection("deals").where("isDeleted", "==", false).where("ownerId", "==", auth.user.uid).limit(500).get()
      );
      dealQueries.push(
        adminDb.collection("deals").where("isDeleted", "==", false).where("createdBy", "==", auth.user.uid).limit(500).get()
      );
    } else {
      dealQueries.push(adminDb.collection("deals").where("isDeleted", "==", false).limit(500).get());
    }

    const dealSnaps = await Promise.all(dealQueries);
    const dealDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    dealSnaps.forEach((snap) => snap.docs.forEach((doc) => dealDocs.set(doc.id, doc)));

    const deals = Array.from(dealDocs.values())
      .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter((deal: any) => {
        if (!isSalesRep) return true;
        const leadId = String(deal.leadId || "");
        if (leadId && leadIds.has(leadId)) return true;
        return deal.ownerId === auth.user.uid || deal.createdBy === auth.user.uid;
      });

    const [eventsSnap] = await Promise.all([
      adminDb
        .collection("events")
        .where("entityType", "in", ["lead", "deal", "follow_up", "campaign"])
        .limit(200)
        .get(),
    ]);

    const totalLeads = leads.length;
    const activeDeals = deals.filter((deal: any) => !String(deal.stage || deal.status || "").toLowerCase().includes("closed")).length;
    const pipelineValue = deals
      .filter((deal: any) => !String(deal.stage || deal.status || "").toLowerCase().includes("closed"))
      .reduce((sum: number, deal: any) => sum + Number(deal.valueUsd || deal.amountUsd || 0), 0);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const closedWonThisMonth = deals.filter((deal: any) => {
      const stage = String(deal.stage || deal.status || "");
      if (stage !== "Closed Won" && stage !== "Won") return false;
      const closedAt = deal.closedAt || deal.closedWonAt || deal.updatedAt || deal.createdAt;
      const iso = toISO(closedAt);
      if (!iso) return false;
      const d = new Date(iso);
      return d >= startOfMonth;
    }).length;

    const closedWonTotal = deals.filter((deal: any) => String(deal.stage || deal.status || "") === "Closed Won").length;
    const conversionRate = totalLeads ? (closedWonTotal / totalLeads) * 100 : 0;

    const stageMap = new Map<string, { stage: string; count: number; value: number }>();
    deals.forEach((deal: any) => {
      const stage = normalizeStage(deal.stage || "New Lead");
      const entry = stageMap.get(stage) || { stage, count: 0, value: 0 };
      entry.count += 1;
      entry.value += Number(deal.valueUsd || deal.amountUsd || 0);
      stageMap.set(stage, entry);
    });

    const ownerMap = new Map<string, { ownerName: string; deals: number; value: number }>();
    deals.forEach((deal: any) => {
      const ownerName = String(deal.ownerName || "Unassigned");
      const entry = ownerMap.get(ownerName) || { ownerName, deals: 0, value: 0 };
      entry.deals += 1;
      entry.value += Number(deal.valueUsd || deal.amountUsd || 0);
      ownerMap.set(ownerName, entry);
    });

    const recentActivity = eventsSnap.docs
      .map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          title: String(data.title || "Sales update"),
          description: String(data.description || ""),
          createdAt: toISO(data.createdAt),
          createdByUid: data.createdByUid ? String(data.createdByUid) : null,
        };
      })
      .filter((item) => (!isSalesRep ? true : item.createdByUid === auth.user.uid))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 6)
      .map(({ createdByUid, ...rest }) => rest);

    const watchers = await getWatcherUserIds();
    const canCreate = canWriteSales(role);

    return NextResponse.json({
      ok: true,
      canCreate,
      watchers,
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
  } catch (err: any) {
    console.error("sales overview error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load overview.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
