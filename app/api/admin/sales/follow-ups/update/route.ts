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

    const docRef = adminDb.collection("followUps").doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false, error: "Follow-up not found." }, { status: 404 });
    }
    const existing = snapshot.data() || {};
    if (existing.tenantId && existing.tenantId !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    if (payload.relatedType !== undefined) updates.relatedType = parseString(payload.relatedType, "Lead");
    if (payload.relatedId !== undefined) updates.relatedId = parseString(payload.relatedId, "") || null;
    if (payload.relatedName !== undefined) updates.relatedName = parseString(payload.relatedName, "");
    if (payload.type !== undefined) updates.type = parseString(payload.type, "Call");
    if (payload.dueDate !== undefined) {
      const dueDateRaw = parseString(payload.dueDate, "").trim();
      if (!dueDateRaw || !dueDateRaw.includes("T")) {
        return NextResponse.json({ ok: false, error: "Follow-up date and time are required." }, { status: 400 });
      }
      const dueDateObj = new Date(dueDateRaw);
      if (Number.isNaN(dueDateObj.getTime())) {
        return NextResponse.json({ ok: false, error: "Invalid follow-up date." }, { status: 400 });
      }
      updates.dueDate = dueDateObj.toISOString();
    }
    if (payload.ownerId !== undefined) updates.ownerId = parseString(payload.ownerId, "") || null;
    if (payload.ownerName !== undefined) updates.ownerName = parseString(payload.ownerName, "") || null;
    if (payload.status !== undefined) updates.status = parseString(payload.status, "Open");

    await docRef.set(updates, { merge: true });

    await createSalesEvent({
      type: "follow_up_updated",
      title: "Follow-up updated",
      description: `Follow-up ${id} updated`,
      entityType: "follow_up",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: String(auth.user.name || auth.user.fullName || ""),
      tenantId: auth.user.tenantId as string | null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("sales follow-ups update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update follow-up." }, { status: 500 });
  }
}
