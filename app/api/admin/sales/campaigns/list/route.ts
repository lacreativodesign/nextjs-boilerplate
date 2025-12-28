import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "../../_utils";

export const dynamic = "force-dynamic";

type CampaignDoc = {
  name?: string;
  channel?: string;
  leadsCount?: number;
  dealsCount?: number;
  revenueUsd?: number;
  conversionRate?: number;
  isDeleted?: boolean;
};

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb.collection("campaigns").where("isDeleted", "==", false).limit(500).get();

    const campaigns = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as CampaignDoc;
      const leadsCount = Number(data.leadsCount || 0);
      const dealsCount = Number(data.dealsCount || 0);
      const conversionRate =
        typeof data.conversionRate === "number" ? data.conversionRate : leadsCount ? (dealsCount / leadsCount) * 100 : 0;
      return {
        id: doc.id,
        name: data.name || "",
        channel: data.channel || "",
        leadsCount,
        dealsCount,
        revenueUsd: Number(data.revenueUsd || 0),
        conversionRate,
      };
    });

    return NextResponse.json({ ok: true, campaigns });
  } catch (err: any) {
    console.error("sales campaigns list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load campaigns." }, { status: 500 });
  }
}
