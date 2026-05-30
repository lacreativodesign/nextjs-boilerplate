import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, toISO } from "../../_utils";

export const dynamic = "force-dynamic";

type FollowUpDoc = {
  relatedType?: string;
  relatedId?: string | null;
  relatedName?: string;
  type?: string;
  dueDate?: unknown;
  ownerId?: string | null;
  ownerName?: string | null;
  status?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  isDeleted?: boolean;
};

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = auth.user.tenantId || "";
    const snap = await adminDb
      .collection("followUps")
      .where("tenantId", "==", tenantId)
      .where("isDeleted", "==", false)
      .limit(500)
      .get();

    const followUps = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as FollowUpDoc;
      return {
        id: doc.id,
        relatedType: data.relatedType || "Lead",
        relatedId: data.relatedId || null,
        relatedName: data.relatedName || "",
        type: data.type || "Call",
        dueDate: toISO(data.dueDate),
        ownerId: data.ownerId || null,
        ownerName: data.ownerName || null,
        status: data.status || "Open",
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
      };
    });

    return NextResponse.json({ ok: true, followUps });
  } catch (err) {
    console.error("sales follow-ups list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load follow-ups." }, { status: 500 });
  }
}
