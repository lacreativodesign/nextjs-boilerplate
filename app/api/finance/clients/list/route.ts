import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance } from "../../_utils";

export const dynamic = "force-dynamic";

type ClientDoc = {
  companyName?: string;
  deletedAt?: any;
};

export async function GET() {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = auth.user.tenantId || "";
    const snap = await adminDb.collection("clients").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(500).get();
    const clients = snap.docs
      .map((doc) => {
        const data = (doc.data() || {}) as ClientDoc;
        if (data.deletedAt) return null;
        return { id: doc.id, companyName: data.companyName || "" };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, clients });
  } catch (err: any) {
    console.error("finance/clients list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load clients.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
