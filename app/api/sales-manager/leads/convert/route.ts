import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createSalesEvent,
  notifyUsers,
  parseString,
  requireSalesManager,
  serverTimestamp,
} from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const id = parseString(payload.id, "");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing lead id." }, { status: 400 });
    }

    const leadRef = adminDb.collection("leads").doc(id);
    const dealRef = adminDb.collection("deals").doc();
    let ownerId: string | null = null;
    let ownerName: string | null = null;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(leadRef);
      if (!snap.exists) {
        throw new Error("Lead not found");
      }
      const data = snap.data() || {};
      if (data.dealId) {
        throw new Error("Lead already converted");
      }

      ownerId = data.ownerId || null;
      ownerName = data.ownerName || null;

      tx.set(dealRef, {
        dealName: data.name || "New Deal",
        clientName: data.companyName || data.name || "",
        leadName: data.name || "",
        leadEmail: data.email || "",
        leadPhone: data.phone || "",
        stage: "New Lead",
        valueUsd: 0,
        probability: 0,
        ownerId: ownerId || null,
        ownerName: ownerName || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
      });

      tx.set(
        leadRef,
        {
          stage: "Qualified",
          dealId: dealRef.id,
          convertedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    await notifyUsers({
      userIds: [auth.user.uid, ownerId || ""],
      title: "Lead converted",
      body: `Lead ${id} converted to deal ${dealRef.id}.`,
      entityType: "deal",
      entityId: dealRef.id,
      deepLink: "/sales-manager/deals",
      createdBy: { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || "" },
    });

    await createSalesEvent({
      type: "lead_converted",
      title: "Lead converted",
      description: `Lead ${id} converted to deal ${dealRef.id}`,
      entityType: "lead",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || "",
    });

    return NextResponse.json({ ok: true, dealId: dealRef.id });
  } catch (err: any) {
    console.error("sales manager lead convert error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unable to convert lead." }, { status: 500 });
  }
}
