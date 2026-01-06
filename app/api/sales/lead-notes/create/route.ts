import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { parseString, requireSalesWrite, serverTimestamp, userLabel } from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const leadId = parseString(body.leadId, "");
    const noteBody = parseString(body.body, "").trim();
    if (!leadId || !noteBody) {
      return NextResponse.json({ ok: false, error: "Lead and note body are required." }, { status: 400 });
    }

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

    const ref = adminDb.collection("leadNotes").doc();
    await ref.set({
      id: ref.id,
      tenantId: auth.user.tenantId || "",
      leadId,
      authorUserId: auth.user.uid,
      authorRole: auth.user.role || "",
      authorName: userLabel(auth.user),
      body: noteBody,
      createdAt: serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("lead notes create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to save note." }, { status: 500 });
  }
}
