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

    const snap = await adminDb.collection("performanceReviews").where("tenantId", "==", access.user.tenantId).where("isDeleted", "==", false).orderBy("createdAt", "desc").limit(100).get();
    const reviews = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: toIso(data?.createdAt),
          updatedAt: toIso(data?.updatedAt),
        };
      })
      .filter((review: any) => review?.isDeleted !== true);

    return NextResponse.json({ ok: true, reviews });
  } catch (err) {
    console.error("HR performance list error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
