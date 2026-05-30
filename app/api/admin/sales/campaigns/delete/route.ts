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
      return NextResponse.json({ ok: false, error: "Missing campaign id." }, { status: 400 });
    }

    const snap = await adminDb.collection("campaigns").doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const data = snap.data() || {};
    const isSuperAdmin = (auth.user.role || "").toLowerCase() === "super_admin";
    if (!isSuperAdmin && String(data.tenantId || "") !== String(auth.user.tenantId || "")) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    await adminDb.collection("campaigns").doc(id).set(
      {
        isDeleted: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await createSalesEvent({
      type: "campaign_deleted",
      title: "Campaign deleted",
      description: `Campaign ${id} deleted`,
      entityType: "campaign",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || "",
      tenantId: auth.user.tenantId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("sales campaigns delete error:", err);
    return NextResponse.json({ ok: false, error: "Unable to delete campaign." }, { status: 500 });
  }
}
