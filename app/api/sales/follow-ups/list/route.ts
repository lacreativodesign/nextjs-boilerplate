import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { isSales, requireSalesRead, toISO } from "../../_utils";

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
  assignedTo?: string | null;
  createdBy?: string | null;
};

export async function GET() {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const role = auth.user.role || "";
    const salesRep = isSales(role);

    const tenantId = auth.user.tenantId || "";
    const snaps = salesRep
      ? await Promise.all([
          adminDb
            .collection("followUps")
            .where("tenantId", "==", tenantId)
            .where("isDeleted", "==", false)
            .where("assignedTo", "==", auth.user.uid)
            .limit(500)
            .get(),
          adminDb
            .collection("followUps")
            .where("tenantId", "==", tenantId)
            .where("isDeleted", "==", false)
            .where("createdBy", "==", auth.user.uid)
            .limit(500)
            .get(),
        ])
      : await Promise.all([
          adminDb.collection("followUps").where("tenantId", "==", tenantId).where("isDeleted", "==", false).limit(500).get(),
          Promise.resolve(null),
        ]);

    const map = new Map<string, FollowUpDoc>();
    snaps.forEach((snap) => {
      if (snap) {
        snap.docs.forEach((doc) => map.set(doc.id, doc.data() as FollowUpDoc));
      }
    });

    const followUps = Array.from(map.entries()).map(([id, data]) => ({
      id,
      relatedType: String(data.relatedType || "Lead"),
      relatedId: data.relatedId || null,
      relatedName: String(data.relatedName || ""),
      type: String(data.type || "Call"),
      dueDate: toISO(data.dueDate),
      ownerId: data.ownerId || data.assignedTo || null,
      ownerName: data.ownerName || null,
      status: String(data.status || "Open"),
      assignedTo: data.assignedTo || null,
      createdBy: data.createdBy || null,
      createdAt: toISO(data.createdAt),
      updatedAt: toISO(data.updatedAt),
      isDeleted: Boolean(data.isDeleted),
    }));

    return NextResponse.json({ ok: true, followUps });
  } catch (err) {
    console.error("sales follow-ups list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load follow-ups." }, { status: 500 });
  }
}
