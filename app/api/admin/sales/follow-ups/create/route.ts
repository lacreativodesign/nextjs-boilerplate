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
    const relatedType = parseString(payload.relatedType, "Lead");
    const relatedId = parseString(payload.relatedId, "") || null;
    const relatedName = parseString(payload.relatedName, "");
    const type = parseString(payload.type, "Call");
    const dueDateRaw = parseString(payload.dueDate, "").trim();
    const ownerId = parseString(payload.ownerId, "") || null;
    const ownerName = parseString(payload.ownerName, "") || null;
    const status = parseString(payload.status, "Open");

    if (!dueDateRaw || !dueDateRaw.includes("T")) {
      return NextResponse.json({ ok: false, error: "Follow-up date and time are required." }, { status: 400 });
    }
    const dueDateObj = new Date(dueDateRaw);
    if (Number.isNaN(dueDateObj.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid follow-up date." }, { status: 400 });
    }

    const docRef = await adminDb.collection("followUps").add({
      tenantId: auth.user.tenantId || "",
      relatedType,
      relatedId,
      relatedName,
      type,
      dueDate: dueDateObj.toISOString(),
      ownerId,
      ownerName,
      status,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await createSalesEvent({
      type: "follow_up_created",
      title: "Follow-up created",
      description: `${relatedName || "Follow-up"} scheduled`,
      entityType: "follow_up",
      entityId: docRef.id,
      createdByUid: auth.user.uid,
      createdByName: String(auth.user.name || auth.user.fullName || ""),
      tenantId: auth.user.tenantId as string | null,
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err) {
    console.error("sales follow-ups create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to create follow-up." }, { status: 500 });
  }
}
