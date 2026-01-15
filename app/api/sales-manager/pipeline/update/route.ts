import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  arrayUnion,
  createSalesEvent,
  notifyUsers,
  parseString,
  requireSalesManager,
  serverTimestamp,
} from "../../_utils";

export const dynamic = "force-dynamic";

const ALLOWED_STAGES = [
  "New Lead",
  "Contacted",
  "Qualified",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

export async function POST(req: Request) {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const id = parseString(payload.id, "");
    const stage = parseString(payload.stage, "");
    if (!id || !stage) {
      return NextResponse.json({ ok: false, error: "Missing deal update fields." }, { status: 400 });
    }

    if (!ALLOWED_STAGES.includes(stage)) {
      return NextResponse.json({ ok: false, error: "Invalid pipeline stage." }, { status: 400 });
    }

    const dealRef = adminDb.collection("deals").doc(id);
    let prevStage = "";
    let ownerId: string | null = null;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(dealRef);
      if (!snap.exists) {
        throw new Error("Deal not found");
      }
      const data = snap.data() || {};
      prevStage = parseString(data.stage, "New Lead");
      if (prevStage === stage) return;
      ownerId = data.ownerId || null;

      const updates: Record<string, any> = {
        stage,
        stageHistory: arrayUnion({
          from: prevStage,
          to: stage,
          changedAt: serverTimestamp(),
          changedByUid: auth.user.uid,
          changedByName: auth.user.name || auth.user.fullName || "",
        }),
        updatedAt: serverTimestamp(),
      };

      if (stage === "Closed Won") {
        updates.closedWonAt = serverTimestamp();
      }
      if (stage === "Closed Lost") {
        updates.closedLostAt = serverTimestamp();
      }

      tx.set(dealRef, updates, { merge: true });
    });

    if (!prevStage || prevStage === stage) {
      return NextResponse.json({ ok: true });
    }

    const createdByName = auth.user.name || auth.user.fullName || "";
    await createSalesEvent({
      type: "deal_stage_change",
      title: "Pipeline stage updated",
      description: `Deal ${id} moved to ${stage}`,
      entityType: "deal",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName,
      metadata: { stage },
    });

    await notifyUsers({
      userIds: [auth.user.uid, ownerId || ""],
      title: "Deal stage moved",
      body: `Deal ${id} moved from ${prevStage} to ${stage}.`,
      entityType: "deal",
      entityId: id,
      deepLink: "/sales_manager/pipeline",
      createdBy: { uid: auth.user.uid, name: createdByName },
    });

    if (stage === "Closed Won" || stage === "Closed Lost") {
      await notifyUsers({
        userIds: [auth.user.uid, ownerId || ""],
        title: stage === "Closed Won" ? "Deal closed won" : "Deal closed lost",
        body: `Deal ${id} marked ${stage}.`,
        entityType: "deal",
        entityId: id,
        deepLink: "/sales_manager/deals",
        createdBy: { uid: auth.user.uid, name: createdByName },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales manager pipeline update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update pipeline." }, { status: 500 });
  }
}
