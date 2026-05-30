import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSalesReportsAccess, toISO } from "../../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireSalesReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const [leadsSnap, dealsSnap] = await Promise.all([
      adminDb.collection("leads").where("tenantId", "==", auth.user.tenantId).where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("deals").where("tenantId", "==", auth.user.tenantId).where("isDeleted", "==", false).limit(500).get(),
    ]);

    const leadSourceMap = new Map<string, number>();
    leadsSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const source = String(data.source || "Unknown");
      leadSourceMap.set(source, (leadSourceMap.get(source) || 0) + 1);
    });

    let won = 0;
    let lost = 0;
    const agingBuckets = [
      { label: "0-7 days", value: 0 },
      { label: "8-14 days", value: 0 },
      { label: "15-30 days", value: 0 },
      { label: "31+ days", value: 0 },
    ];

    const now = new Date();

    dealsSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const stage = String(data.stage || "");
      if (stage === "Closed Won") won += 1;
      if (stage === "Closed Lost") lost += 1;

      if (stage !== "Closed Won" && stage !== "Closed Lost") {
        const createdAt = toISO(data.createdAt || data.updatedAt);
        if (!createdAt) return;
        const createdDate = new Date(createdAt);
        const ageDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
        if (ageDays <= 7) agingBuckets[0].value += 1;
        else if (ageDays <= 14) agingBuckets[1].value += 1;
        else if (ageDays <= 30) agingBuckets[2].value += 1;
        else agingBuckets[3].value += 1;
      }
    });

    const leadSources = Array.from(leadSourceMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const totalClosed = won + lost;
    const ratio = totalClosed ? (won / totalClosed) * 100 : 0;

    return NextResponse.json({
      ok: true,
      leadSources,
      winLoss: { won, lost, ratio },
      agingBuckets,
    });
  } catch (err) {
    console.error("sales manager reports summary error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load reports." }, { status: 500 });
  }
}
