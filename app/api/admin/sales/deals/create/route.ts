import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { arrayUnion, createSalesEvent, parseNumber, parseString, requireAdmin, serverTimestamp } from "../../_utils";
import { createNotifications, getUsersByRoles } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const dealName = parseString(payload.dealName || payload.leadName, "");
    const clientName = parseString(payload.clientName || payload.leadName, "");
    const leadId = parseString(payload.leadId, "") || null;
    const leadName = parseString(payload.leadName, "") || null;
    const leadEmail = parseString(payload.leadEmail, "") || null;
    const leadPhone = parseString(payload.leadPhone, "") || null;
    const source = parseString(payload.source, "") || null;
    const stage = parseString(payload.stage, "New");
    const valueUsd = parseNumber(payload.valueUsd, 0);
    const probability = parseNumber(payload.probability, 10);
    const ownerId = parseString(payload.ownerId, "") || null;
    const ownerName = parseString(payload.ownerName, "") || null;
    const expectedCloseDate = payload.expectedCloseDate || null;

    const docRef = await adminDb.collection("deals").add({
      dealName,
      clientName,
      leadId,
      leadName,
      leadEmail,
      leadPhone,
      source,
      stage,
      valueUsd,
      probability,
      ownerId,
      ownerName,
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
      stageHistory: arrayUnion({
        from: null,
        to: stage,
        changedAt: serverTimestamp(),
        changedByUid: auth.user.uid,
        changedByName: auth.user.name || auth.user.fullName || "",
      }),
      tenantId: auth.user.tenantId || null,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await createSalesEvent({
      type: "deal_created",
      title: "Deal created",
      description: `${dealName || "Deal"} created`,
      entityType: "deal",
      entityId: docRef.id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || "",
      tenantId: auth.user.tenantId,
    });

    const dealNotifyTargets = await getUsersByRoles(["admin", "super_admin", "sales_manager"], auth.user.tenantId);
    await createNotifications({
      recipients: dealNotifyTargets,
      tenantId: auth.user.tenantId,
      type: "info",
      title: "New deal created",
      message: `${dealName || "A new deal"} was added to the pipeline.`,
      entityType: "deal",
      entityId: docRef.id,
      deepLink: "/admin/sales/deals",
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error("sales deals create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to create deal." }, { status: 500 });
  }
}
