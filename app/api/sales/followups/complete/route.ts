import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { parseString, requireSalesWrite, serverTimestamp } from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const followUpId = parseString(body.followUpId, "");
    if (!followUpId) {
      return NextResponse.json({ ok: false, error: "Follow-up id is required." }, { status: 400 });
    }

    const ref = adminDb.collection("followUps").doc(followUpId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Follow-up not found." }, { status: 404 });
    }

    const followUp = snap.data() || {};
    if (followUp.tenantId && followUp.tenantId !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (auth.user.role === "sales" && followUp.ownerId && followUp.ownerId !== auth.user.uid) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    await ref.set(
      {
        status: "done",
        doneAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedById: auth.user.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("followups complete error:", err);
    return NextResponse.json({ ok: false, error: "Unable to complete follow-up." }, { status: 500 });
  }
}
