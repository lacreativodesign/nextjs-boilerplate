import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { parseString, requireSalesWrite, serverTimestamp } from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const leadId = parseString(body.leadId, "");
    const title = parseString(body.title, "").trim();
    const dueAtRaw = parseString(body.dueAt, "");
    if (!leadId || !dueAtRaw) {
      return NextResponse.json({ ok: false, error: "Lead and due date are required." }, { status: 400 });
    }

    const dueDate = new Date(dueAtRaw);
    if (Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid due date." }, { status: 400 });
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

    const ref = adminDb.collection("followUps").doc();
    await ref.set({
      id: ref.id,
      tenantId: auth.user.tenantId || "",
      leadId,
      ownerId: lead.ownerId || auth.user.uid,
      title: title || null,
      dueAt: admin.firestore.Timestamp.fromDate(dueDate),
      status: "open",
      doneAt: null,
      createdAt: serverTimestamp(),
      createdById: auth.user.uid,
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("followups create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to create follow-up." }, { status: 500 });
  }
}
