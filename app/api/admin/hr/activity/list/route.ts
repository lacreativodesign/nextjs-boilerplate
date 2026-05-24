import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireHrAccess, toIso } from "../../_utils";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const snap = await adminDb.collection("events").where("tenantId", "==", access.user.tenantId).orderBy("createdAt", "desc").limit(50).get();
    const activity = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data?.type || "",
          title: data?.title || "",
          description: data?.description || "",
          createdAt: toIso(data?.createdAt),
          createdByName: data?.createdByName || null,
          entityType: data?.entityType || null,
          entityId: data?.entityId || null,
          metadata: data?.metadata || {},
        };
      })
      .filter((event: any) => String(event?.type || "").startsWith("hr."));

    return NextResponse.json({ ok: true, activity });
  } catch (err) {
    console.error("HR activity list error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
