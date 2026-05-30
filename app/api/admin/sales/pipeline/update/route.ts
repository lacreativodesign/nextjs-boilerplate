import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { arrayUnion, createSalesEvent, parseString, requireAdmin, serverTimestamp } from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const id = parseString(payload.id, "");
    const stage = parseString(payload.stage, "");
    if (!id || !stage) {
      return NextResponse.json({ ok: false, error: "Missing deal update fields." }, { status: 400 });
    }

    const dealRef = adminDb.collection("deals").doc(id);
    const preSnap = await dealRef.get();
    if (!preSnap.exists) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const preData = preSnap.data() || {};
    const isSuperAdmin = (auth.user.role || "").toLowerCase() === "super_admin";
    if (!isSuperAdmin && String(preData.tenantId || "") !== String(auth.user.tenantId || "")) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(dealRef);
      if (!snap.exists) {
        throw new Error("Deal not found");
      }
      const data = snap.data() || {};
      const prevStage = parseString(data.stage, "New");
      if (prevStage === stage) return;

      tx.set(
        dealRef,
        {
          stage,
          stageHistory: arrayUnion({
            from: prevStage,
            to: stage,
            changedAt: serverTimestamp(),
            changedByUid: auth.user.uid,
            changedByName: auth.user.name || auth.user.fullName || "",
          }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    await createSalesEvent({
      type: "deal_stage_change",
      title: "Pipeline stage updated",
      description: `Deal ${id} moved to ${stage}`,
      entityType: "deal",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || "",
      metadata: { stage },
      tenantId: auth.user.tenantId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("sales pipeline update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update pipeline." }, { status: 500 });
  }
}
