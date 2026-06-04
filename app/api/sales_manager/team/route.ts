import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { TeamService } from "@/lib/teams/team-service";
import { getSalesManagerTeamMemberIds, requireSalesManager } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const memberIds = await getSalesManagerTeamMemberIds(auth.user);
    const tenantId = auth.user.tenantId || "";

    const leadsBaseQuery = adminDb
      .collection("leads")
      .where("tenantId", "==", tenantId)
      .where("isDeleted", "==", false)
      .limit(500);

    const dealsBaseQuery = adminDb
      .collection("deals")
      .where("tenantId", "==", tenantId)
      .where("isDeleted", "==", false)
      .limit(500);

    const [usersSnap, leadsDocs, dealsDocs] = await Promise.all([
      adminDb.collection("users").where("tenantId", "==", tenantId).where("role", "==", "sales").get(),
      memberIds === null
        ? leadsBaseQuery.get().then((s: any) => s.docs)
        : TeamService.queryWithTeamFilter(leadsBaseQuery, "ownerId", memberIds),
      memberIds === null
        ? dealsBaseQuery.get().then((s: any) => s.docs)
        : TeamService.queryWithTeamFilter(dealsBaseQuery, "ownerId", memberIds),
    ]);

    const leadsCount = new Map<string, number>();
    leadsDocs.forEach((doc: any) => {
      const data = doc.data() || {};
      const ownerId = String(data.ownerId || "");
      if (!ownerId) return;
      leadsCount.set(ownerId, (leadsCount.get(ownerId) || 0) + 1);
    });

    const dealsCount = new Map<string, number>();
    const wonCount = new Map<string, number>();
    const lostCount = new Map<string, number>();
    const revenueWon = new Map<string, number>();

    dealsDocs.forEach((doc: any) => {
      const data = doc.data() || {};
      const ownerId = String(data.ownerId || "");
      if (!ownerId) return;
      dealsCount.set(ownerId, (dealsCount.get(ownerId) || 0) + 1);
      const stage = String(data.stage || "");
      if (stage === "Closed Won") {
        wonCount.set(ownerId, (wonCount.get(ownerId) || 0) + 1);
        revenueWon.set(ownerId, (revenueWon.get(ownerId) || 0) + Number(data.valueUsd || 0));
      }
      if (stage === "Closed Lost") {
        lostCount.set(ownerId, (lostCount.get(ownerId) || 0) + 1);
      }
    });

    const team = usersSnap.docs
      .filter((doc: any) => memberIds === null || memberIds.includes(doc.id))
      .map((doc: any) => {
        const data = doc.data() || {};
        const uid = doc.id;
        return {
          uid,
          name: String(data.name || data.fullName || data.email || "Sales Rep"),
          email: String(data.email || ""),
          leadsAssigned: leadsCount.get(uid) || 0,
          dealsAssigned: dealsCount.get(uid) || 0,
          closedWon: wonCount.get(uid) || 0,
          closedLost: lostCount.get(uid) || 0,
          revenueWon: revenueWon.get(uid) || 0,
        };
      });

    return NextResponse.json({ ok: true, team });
  } catch (err: any) {
    console.error("sales manager team error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load team." }, { status: 500 });
  }
}
