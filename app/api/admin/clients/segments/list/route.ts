import { NextResponse } from "next/server";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../../../_utils";
import { segmentDefaults, slugify } from "@/lib/segments";

export const dynamic = "force-dynamic";

type SegmentDoc = {
  type: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  createdBy?: string | null;
};

async function seedDefaults(createdBy?: string | null) {
  const ref = db.collection("clientSegments");
  const existing = await ref.limit(1).get();
  if (!existing.empty) return false;

  const now = new Date().toISOString();
  const batch = db.batch();

  (Object.keys(segmentDefaults) as Array<keyof typeof segmentDefaults>).forEach((type) => {
    segmentDefaults[type].forEach((name) => {
      const slug = slugify(name);
      const id = `${type}-${slug}`;
      const docRef = ref.doc(id);
      batch.set(docRef, {
        type,
        name,
        slug,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: createdBy || null,
      } as SegmentDoc);
    });
  });

  await batch.commit();
  return true;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const canAdmin = isAdminRole(me.role);

  try {
    const seeded = await seedDefaults(me.uid);
    const snap = await db.collection("clientSegments").get();

    const segments = snap.docs
      .map((doc) => {
        const data = (doc.data() || {}) as SegmentDoc;
        if (data.deletedAt) return null;
        return {
          id: doc.id,
          type: data.type,
          name: data.name,
          slug: data.slug,
          isActive: Boolean(data.isActive),
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return NextResponse.json({ ok: true, segments, seeded, role: me.role, canAdmin });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load segments" }, { status: 500 });
  }
}
