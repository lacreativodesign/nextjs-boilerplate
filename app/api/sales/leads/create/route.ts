import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createSalesEvent,
  getUserNameById,
  getWatcherUserIds,
  notifyUsers,
  parseString,
  nowIso,
  requireSalesWrite,
  userLabel,
} from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const companyName = parseString(payload.companyName, "");
    const contactName = parseString(payload.contactName, "");
    const contactEmail = parseString(payload.contactEmail, "");
    const contactPhone = parseString(payload.contactPhone, "");
    const source = parseString(payload.source, "");
    const notes = parseString(payload.notes, "");
    const stage = parseString(payload.stage, "New Lead");

    const requestedOwnerId = parseString(payload.ownerId, "");
    const ownerId = requestedOwnerId && auth.user.role === "sales_manager" ? requestedOwnerId : auth.user.uid;
    const ownerName = ownerId ? await getUserNameById(ownerId) : "";

    const now = nowIso();
    const docRef = await adminDb.collection("leads").add({
      companyName,
      contactName,
      contactEmail,
      contactPhone,
      source,
      notes,
      stage,
      ownerId,
      ownerName: ownerName || userLabel(auth.user),
      lastActivityAt: now,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user.uid,
      updatedBy: auth.user.uid,
    });

    await createSalesEvent({
      type: "lead_created",
      title: "Lead created",
      description: `${contactName || companyName || "Lead"} created`,
      entityType: "lead",
      entityId: docRef.id,
      createdByUid: auth.user.uid,
      createdByName: userLabel(auth.user),
      metadata: { ownerId, ownerName: ownerName || userLabel(auth.user) },
    });

    const watchers = await getWatcherUserIds();
    await notifyUsers({
      userIds: [ownerId, ...watchers],
      title: "Lead created",
      body: `${contactName || companyName || "Lead"} was created in Sales.`,
      deepLink: "/sales/leads",
      entityType: "lead",
      entityId: docRef.id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error("sales leads create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to create lead." }, { status: 500 });
  }
}
