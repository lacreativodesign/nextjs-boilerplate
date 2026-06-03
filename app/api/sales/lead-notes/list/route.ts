import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { docTenantId } from "@/lib/tenant";
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
    if (!leadId) {
      return NextResponse.json({ ok: false, error: "Lead id is required." }, { status: 400 });
    }

    const leadSnap = await adminDb.collection("leads").doc(leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }

    const lead = leadSnap.data() || {};
    if (docTenantId(lead) !== auth.user.tenantId && auth.user.role !== "super_admin") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (auth.user.role === "sales" && lead.ownerId !== auth.user.uid) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const notesSnap = await adminDb
      .collection("leadNotes")
      .where("tenantId", "==", auth.user.tenantId || "")
      .where("leadId", "==", leadId)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const notes = notesSnap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        body: String(data.body || ""),
        authorUserId: String(data.authorUserId || ""),
        authorRole: String(data.authorRole || ""),
        authorName: String(data.authorName || ""),
        createdAt: toISO(data.createdAt),
      };
    });

    return NextResponse.json({ ok: true, notes });
  } catch (err) {
    console.error("lead notes list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load notes." }, { status: 500 });
  }
}
