import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { isSales, requireSalesRead, toISO } from "../../_utils";

export const dynamic = "force-dynamic";

type CampaignDoc = {
  name?: string;
  channel?: string;
  status?: string;
  metrics?: Record<string, unknown>;
  createdBy?: string | null;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
};

export async function GET() {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const role = auth.user.role || "";
    const salesRep = isSales(role);

    const snap = salesRep
      ? await adminDb.collection("campaigns").where("isDeleted", "==", false).where("createdBy", "==", auth.user.uid).limit(500).get()
      : await adminDb.collection("campaigns").where("isDeleted", "==", false).limit(500).get();

    const campaigns = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as CampaignDoc;
      return {
        id: doc.id,
        name: String(data.name || ""),
        channel: String(data.channel || ""),
        status: String(data.status || "Active"),
        metrics: data.metrics || null,
        createdBy: data.createdBy || null,
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
      };
    });

    return NextResponse.json({ ok: true, campaigns });
  } catch (err: any) {
    console.error("sales campaigns list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load campaigns." }, { status: 500 });
  }
}
