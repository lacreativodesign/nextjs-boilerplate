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
    const name = parseString(payload.name, "");
    const channel = parseString(payload.channel, "");
    const leadsCount = parseNumber(payload.leadsCount, 0);
    const dealsCount = parseNumber(payload.dealsCount, 0);
    const revenueUsd = parseNumber(payload.revenueUsd, 0);

    const docRef = await adminDb.collection("campaigns").add({
      name,
      channel,
      leadsCount,
      dealsCount,
      revenueUsd,
      conversionRate: leadsCount ? (dealsCount / leadsCount) * 100 : 0,
      tenantId: auth.user.tenantId || null,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await createSalesEvent({
      type: "campaign_created",
      title: "Campaign created",
      description: `${name || "Campaign"} created`,
      entityType: "campaign",
      entityId: docRef.id,
      createdByUid: auth.user.uid,
      createdByName: String(auth.user.name || auth.user.fullName || ""),
      tenantId: auth.user.tenantId as string | null,
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err) {
    console.error("sales campaigns create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to create campaign." }, { status: 500 });
  }
}
