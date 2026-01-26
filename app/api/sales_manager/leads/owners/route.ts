import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSalesManager } from "../../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb
      .collection("users")
      .where("tenantId", "==", auth.user.tenantId || "")
      .where("role", "==", "sales")
      .get();
    const owners = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        uid: doc.id,
        name: String(data.name || data.fullName || data.email || "Sales Rep"),
      };
    });

    return NextResponse.json({ ok: true, owners });
  } catch (err: any) {
    console.error("sales manager owners list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load sales reps." }, { status: 500 });
  }
}
