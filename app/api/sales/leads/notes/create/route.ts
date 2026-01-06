import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createSalesEvent,
  getWatcherUserIds,
  notifyUsers,
  parseString,
  requireSalesWrite,
  serverTimestamp,
  userLabel,
} from "../../../_utils";

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
    const authorName = userLabel(auth.user);
    await ref.set({
      id: ref.id,
      tenantId: auth.user.tenantId || "",
      leadId,
      authorId: auth.user.uid,
      authorName,
      body: noteBody,
      createdAt: serverTimestamp(),
    });

    await adminDb
      .collection("leads")
      .doc(leadId)
      .set(
        {
          notesCount: admin.firestore.FieldValue.increment(1),
          lastActivityAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

    const ownerId = String(lead.ownerId || "");
    await createSalesEvent({
      type: "lead_note_added",
      title: "Note added",
      description: `New note added by ${authorName}.`,
      entityType: "lead",
      entityId: leadId,
      createdByUid: auth.user.uid,
      createdByName: authorName,
    });

    const watchers = await getWatcherUserIds(auth.user.tenantId || "");
    await notifyUsers({
      userIds: [ownerId, ...watchers],
      title: "Lead note added",
      body: `${authorName} added a note.`,
      deepLink: `/sales/leads?open=${leadId}`,
      entityType: "lead",
      entityId: leadId,
      createdBy: { uid: auth.user.uid, name: authorName },
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("lead notes create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to save note." }, { status: 500 });
  }
}
