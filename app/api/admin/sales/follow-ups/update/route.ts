import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createSalesEvent, parseString, requireAdmin, serverTimestamp } from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const id = parseString(payload.id, "");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing follow-up id." }, { status: 400 });
    }

    const updates: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (payload.relatedType !== undefined) updates.relatedType = parseString(payload.relatedType, "Lead");
    if (payload.relatedId !== undefined) updates.relatedId = parseString(payload.relatedId, "") || null;
    if (payload.relatedName !== undefined) updates.relatedName = parseString(payload.relatedName, "");
    if (payload.type !== undefined) updates.type = parseString(payload.type, "Call");
    if (payload.dueDate !== undefined) updates.dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
    if (payload.ownerId !== undefined) updates.ownerId = parseString(payload.ownerId, "") || null;
    if (payload.ownerName !== undefined) updates.ownerName = parseString(payload.ownerName, "") || null;
    if (payload.status !== undefined) updates.status = parseString(payload.status, "Open");

    await adminDb.collection("followUps").doc(id).set(updates, { merge: true });

    await createSalesEvent({
      type: "follow_up_updated",
      title: "Follow-up updated",
      description: `Follow-up ${id} updated`,
      entityType: "follow_up",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || "",
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales follow-ups update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update follow-up." }, { status: 500 });
  }
}
