import { NextResponse } from "next/server";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { getSessionUser, isClientRole } from "../../_utils";

export const dynamic = "force-dynamic";

type SegmentDoc = {
  type: string;
  name: string;
  slug: string;
  isActive: boolean;
  deletedAt?: string;
};

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isClientRole(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  try {
    const snap = await db.collection("clientSegments").where("tenantId", "==", me.tenantId).where("isActive", "==", true).get();
    const segments = snap.docs
      .map((doc) => {
        const data = (doc.data() || {}) as SegmentDoc;
        if (data.deletedAt) return null;
        return {
          id: doc.id,
          type: data.type,
          name: data.name,
          slug: data.slug,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return NextResponse.json({ ok: true, segments });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err instanceof Error ? err.message : undefined) || "Failed to load segments" }, { status: 500 });
  }
}
