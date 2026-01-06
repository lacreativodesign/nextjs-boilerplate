import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSalesManager } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = auth.user.tenantId || "";
    const [usersSnap, leadsSnap, dealsSnap, paymentSnap] = await Promise.all([
      adminDb.collection("users").where("role", "==", "sales").where("tenantId", "==", tenantId).get(),
      adminDb.collection("leads").where("tenantId", "==", tenantId).where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("deals").where("tenantId", "==", tenantId).where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("paymentRequests").where("tenantId", "==", tenantId).limit(500).get(),
    ]);

    const leadsCount = new Map<string, number>();
    const leadOwnerMap = new Map<string, string>();
    leadsSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const ownerId = String(data.ownerId || "");
      if (!ownerId) return;
      leadsCount.set(ownerId, (leadsCount.get(ownerId) || 0) + 1);
      leadOwnerMap.set(doc.id, ownerId);
    });

    const dealsCount = new Map<string, number>();
    const wonCount = new Map<string, number>();
    const lostCount = new Map<string, number>();
    const revenueWon = new Map<string, number>();

    dealsSnap.docs.forEach((doc) => {
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

    const paymentCount = new Map<string, number>();
    paymentSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const leadId = String(data.leadId || "");
      const ownerId = leadOwnerMap.get(leadId);
      if (!ownerId) return;
      paymentCount.set(ownerId, (paymentCount.get(ownerId) || 0) + 1);
    });

    const team = usersSnap.docs.map((doc) => {
      const data = doc.data() || {};
      const uid = doc.id;
      return {
        uid,
        name: String(data.name || data.fullName || data.email || "Sales Rep"),
        email: String(data.email || ""),
        leadsAssigned: leadsCount.get(uid) || 0,
        dealsAssigned: dealsCount.get(uid) || 0,
        paymentRequests: paymentCount.get(uid) || 0,
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
