import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createSalesEvent, parseNumber, parseString, requireAdmin, serverTimestamp } from "../../_utils";

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

    const updates: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    if (payload.name !== undefined) updates.name = parseString(payload.name, "");
    if (payload.channel !== undefined) updates.channel = parseString(payload.channel, "");
    if (payload.leadsCount !== undefined) updates.leadsCount = parseNumber(payload.leadsCount, 0);
    if (payload.dealsCount !== undefined) updates.dealsCount = parseNumber(payload.dealsCount, 0);
    if (payload.revenueUsd !== undefined) updates.revenueUsd = parseNumber(payload.revenueUsd, 0);
    if (updates.leadsCount !== undefined || updates.dealsCount !== undefined) {
      const leads = updates.leadsCount ?? payload.leadsCount ?? 0;
      const deals = updates.dealsCount ?? payload.dealsCount ?? 0;
      updates.conversionRate = leads ? (deals / leads) * 100 : 0;
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

    await adminDb.collection("campaigns").doc(id).set(updates, { merge: true });

    await createSalesEvent({
      type: "campaign_updated",
      title: "Campaign updated",
      description: `Campaign ${id} updated`,
      entityType: "campaign",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: String(auth.user.name || auth.user.fullName || ""),
      tenantId: auth.user.tenantId as string | null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("sales campaigns update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update campaign." }, { status: 500 });
  }
}
