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
      return NextResponse.json({ ok: false, error: "Missing lead id." }, { status: 400 });
    }

    const updates: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (payload.name !== undefined) updates.name = parseString(payload.name, "");
    if (payload.email !== undefined) updates.email = parseString(payload.email, "");
    if (payload.phone !== undefined) updates.phone = parseString(payload.phone, "");
    if (payload.source !== undefined) updates.source = parseString(payload.source, "");
    if (payload.stage !== undefined) updates.stage = parseString(payload.stage, "New");
    if (payload.ownerId !== undefined) updates.ownerId = parseString(payload.ownerId, "") || null;
    if (payload.ownerName !== undefined) updates.ownerName = parseString(payload.ownerName, "") || null;

    const snap = await adminDb.collection("leads").doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const data = snap.data() || {};
    const isSuperAdmin = (auth.user.role || "").toLowerCase() === "super_admin";
    if (!isSuperAdmin && String(data.tenantId || "") !== String(auth.user.tenantId || "")) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    await adminDb.collection("leads").doc(id).set(updates, { merge: true });

    await createSalesEvent({
      type: "lead_updated",
      title: "Lead updated",
      description: `Lead ${id} updated`,
      entityType: "lead",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || "",
      tenantId: auth.user.tenantId,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales leads update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update lead." }, { status: 500 });
  }
}
