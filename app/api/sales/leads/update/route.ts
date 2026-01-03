import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createSalesEvent,
  getUserNameById,
  getWatcherUserIds,
  notifyUsers,
  normalizeStage,
  parseString,
  requireSalesRead,
  nowIso,
  requireSalesWrite,
  userLabel,
} from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const id = parseString(body.id, "");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Lead id is required." }, { status: 400 });
    }

    const docRef = adminDb.collection("leads").doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }

    const existing = snapshot.data() || {};
    const role = auth.user.role || "";
    const canWrite = await requireSalesWrite();
    if (!canWrite.ok) {
      return NextResponse.json({ ok: false, error: canWrite.error }, { status: canWrite.status });
    }

    const isOwner = existing.ownerId === auth.user.uid || existing.createdBy === auth.user.uid;
    if (role === "sales" && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const stage = normalizeStage(parseString(body.stage, existing.stage || "New Lead"));
    const companyName = parseString(body.companyName, existing.companyName || "");
    const contactName = parseString(body.contactName, existing.contactName || existing.name || "");
    const contactEmail = parseString(body.contactEmail, existing.contactEmail || existing.email || "");
    const contactPhone = parseString(body.contactPhone, existing.contactPhone || existing.phone || "");
    const source = parseString(body.source, existing.source || "");
    const notes = parseString(body.notes, existing.notes || "");

    let ownerId = existing.ownerId || null;
    let ownerName = existing.ownerName || "";

    if (canWrite.ok && body.ownerId !== undefined && role === "sales_manager") {
      const nextOwnerId = parseString(body.ownerId, "");
      ownerId = nextOwnerId || null;
      ownerName = ownerId ? await getUserNameById(ownerId) : "";
    }

    const now = nowIso();
    const updates: Record<string, any> = {
      companyName,
      contactName,
      contactEmail,
      contactPhone,
      source,
      notes,
      stage,
      ownerId,
      ownerName,
      lastActivityAt: now,
      updatedAt: now,
      updatedBy: auth.user.uid,
    };

    await docRef.set(updates, { merge: true });

    if (stageChanged) {
      const dealsSnap = await adminDb.collection("deals").where("leadId", "==", id).limit(500).get();
      if (!dealsSnap.empty) {
        const batch = adminDb.batch();
        dealsSnap.docs.forEach((doc) => {
          batch.set(
            doc.ref,
            {
              stage,
              updatedAt: now,
              updatedBy: auth.user.uid,
            },
            { merge: true }
          );
        });
        await batch.commit();
      }
    }

    const stageChanged = String(existing.stage || "") !== stage;

    await createSalesEvent({
      type: stageChanged ? "lead_stage_changed" : "lead_updated",
      title: stageChanged ? "Lead stage updated" : "Lead updated",
      description: stageChanged
        ? `${contactName || companyName || "Lead"} moved to ${stage}.`
        : `${contactName || companyName || "Lead"} updated`,
      entityType: "lead",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: userLabel(auth.user),
      metadata: { stage, ownerId, ownerName },
    });

    const watchers = await getWatcherUserIds();
    await notifyUsers({
      userIds: [ownerId, ...watchers],
      title: stageChanged ? "Lead stage moved" : "Lead updated",
      body: stageChanged
        ? `${contactName || companyName || "Lead"} moved to ${stage}.`
        : `${contactName || companyName || "Lead"} was updated.`,
      deepLink: "/sales/pipeline",
      entityType: "lead",
      entityId: id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales leads update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update lead." }, { status: 500 });
  }
}
