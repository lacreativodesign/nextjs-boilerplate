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
      return NextResponse.json({ ok: false, error: "Missing deal id." }, { status: 400 });
    }

    await adminDb.collection("deals").doc(id).set(
      {
        isDeleted: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await createSalesEvent({
      type: "deal_deleted",
      title: "Deal deleted",
      description: `Deal ${id} deleted`,
      entityType: "deal",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || "",
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales deals delete error:", err);
    return NextResponse.json({ ok: false, error: "Unable to delete deal." }, { status: 500 });
  }
}
