import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { parseString, requireSalesRead, toISO } from "../../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const leadId = parseString(searchParams.get("leadId"), "");

    if (leadId) {
      const leadSnap = await adminDb.collection("leads").doc(leadId).get();
      if (!leadSnap.exists) {
        return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
      }
      const lead = leadSnap.data() || {};
      if (lead.tenantId && lead.tenantId !== auth.user.tenantId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      if (auth.user.role === "sales" && lead.ownerId !== auth.user.uid) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    let query: FirebaseFirestore.Query = adminDb
      .collection("emails")
      .where("tenantId", "==", auth.user.tenantId || "")
      .where("mailboxUserId", "==", auth.user.uid)
      .orderBy("createdAt", "desc")
      .limit(200);

    if (leadId) {
      query = adminDb
        .collection("emails")
        .where("tenantId", "==", auth.user.tenantId || "")
        .where("mailboxUserId", "==", auth.user.uid)
        .where("leadId", "==", leadId)
        .orderBy("createdAt", "desc")
        .limit(200);
    }

    const snap = await query.get();
    const emails = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        subject: String(data.subject || ""),
        from: String(data.from || ""),
        to: Array.isArray(data.to) ? data.to.map(String) : [],
        direction: String(data.direction || "outbound"),
        bodyText: String(data.bodyText || ""),
        bodyHtml: data.bodyHtml || null,
        signatureHtml: data.signatureHtml || null,
        status: String(data.status || "queued"),
        provider: String(data.provider || "manual"),
        createdAt: toISO(data.createdAt),
      };
    });

    return NextResponse.json({ ok: true, emails });
  } catch (err) {
    console.error("sales emails list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load emails." }, { status: 500 });
  }
}
