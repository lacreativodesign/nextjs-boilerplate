import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { parseString, requireSalesRead, toISO, isSales } from "../../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const leadId = parseString(searchParams.get("leadId"), "");
    const tenantId = auth.user.tenantId || "";

    if (leadId) {
      const leadSnap = await adminDb.collection("leads").doc(leadId).get();
      if (!leadSnap.exists) {
        return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
      }
      const lead = leadSnap.data() || {};
      if (lead.tenantId && lead.tenantId !== tenantId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      if (auth.user.role === "sales" && lead.ownerId !== auth.user.uid) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    const salesRep = isSales(auth.user.role || "");
    let snaps: FirebaseFirestore.QuerySnapshot[] = [];

    if (leadId) {
      const snap = await adminDb
        .collection("followUps")
        .where("tenantId", "==", tenantId)
        .where("leadId", "==", leadId)
        .orderBy("createdAt", "desc")
        .limit(200)
        .get();
      snaps = [snap];
    } else if (salesRep) {
      const [ownerSnap, createdSnap] = await Promise.all([
        adminDb
          .collection("followUps")
          .where("tenantId", "==", tenantId)
          .where("ownerId", "==", auth.user.uid)
          .orderBy("createdAt", "desc")
          .limit(200)
          .get(),
        adminDb
          .collection("followUps")
          .where("tenantId", "==", tenantId)
          .where("createdById", "==", auth.user.uid)
          .orderBy("createdAt", "desc")
          .limit(200)
          .get(),
      ]);
      snaps = [ownerSnap, createdSnap];
    } else {
      const snap = await adminDb
        .collection("followUps")
        .where("tenantId", "==", tenantId)
        .orderBy("createdAt", "desc")
        .limit(500)
        .get();
      snaps = [snap];
    }

    const map = new Map<string, FirebaseFirestore.DocumentData>();
    snaps.forEach((snap) => {
      snap.docs.forEach((doc) => map.set(doc.id, doc.data() || {}));
    });

    const followUps = Array.from(map.entries()).map(([id, data]) => {
      const rawStatus = String(data.status || "open").toLowerCase();
      const status = rawStatus === "done" ? "done" : "open";
      return {
      id,
      tenantId: String(data.tenantId || tenantId),
      leadId: String(data.leadId || leadId || ""),
      ownerId: String(data.ownerId || ""),
      title: String(data.title || ""),
      dueAt: toISO(data.dueAt),
      status,
      doneAt: toISO(data.doneAt),
      createdAt: toISO(data.createdAt),
      createdById: String(data.createdById || ""),
      };
    });

    return NextResponse.json({ ok: true, followUps });
  } catch (err) {
    console.error("followups list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load follow-ups." }, { status: 500 });
  }
}
