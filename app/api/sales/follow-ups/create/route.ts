import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createSalesEvent,
  getUserNameById,
  getWatcherUserIds,
  notifyUsers,
  nowIso,
  parseString,
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
    const relatedType = parseString(payload.relatedType, "Lead");
    const relatedName = parseString(payload.relatedName, "");
    const relatedId = parseString(payload.relatedId, "") || null;
    const type = parseString(payload.type, "Call");
    const dueDate = parseString(payload.dueDate, "");
    const status = parseString(payload.status, "Open");

    const requestedAssignee = parseString(payload.assignedTo, "");
    const assignedTo = auth.user.role === "sales_manager" && requestedAssignee ? requestedAssignee : auth.user.uid;
    const ownerName = assignedTo ? await getUserNameById(assignedTo) : userLabel(auth.user);

    const now = nowIso();
    const docRef = await adminDb.collection("followUps").add({
      relatedType,
      relatedName,
      relatedId,
      type,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      status,
      assignedTo,
      ownerId: assignedTo,
      ownerName,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user.uid,
      updatedBy: auth.user.uid,
    });

    await createSalesEvent({
      type: "follow_up_created",
      title: "Follow-up created",
      description: `${relatedName || "Follow-up"} scheduled`,
      entityType: "follow_up",
      entityId: docRef.id,
      createdByUid: auth.user.uid,
      createdByName: userLabel(auth.user),
    });

    const watchers = await getWatcherUserIds();
    await notifyUsers({
      userIds: [assignedTo, ...watchers],
      title: "Follow-up created",
      body: `${relatedName || "Follow-up"} scheduled for ${dueDate || "upcoming"}.`,
      deepLink: "/sales/follow-ups",
      entityType: "follow_up",
      entityId: docRef.id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error("sales follow-ups create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to create follow-up." }, { status: 500 });
  }
}
