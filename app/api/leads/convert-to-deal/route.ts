import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { logEvent } from "@/lib/audit";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { getCurrentUser, isAdminOrSuper, isSalesManager } from "../../admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isSalesManager(me.role) && !isAdminOrSuper(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const leadId = cleanString(body.leadId || body.id);
    if (!leadId) {
      return NextResponse.json({ ok: false, error: "Missing leadId." }, { status: 400 });
    }

    const tenantId = normalizeTenantId(me.tenantId as string | null | undefined);
    const leadRef = adminDb.collection("leads").doc(leadId);
    const dealRef = adminDb.collection("deals").doc();

    let dealName = "New Deal";
    let leadEmail = "";
    let leadPhone = "";
    let source = "";
    let ownerUid: string | null = null;
    let ownerName: string | null = null;

    await adminDb.runTransaction(async (tx) => {
      const leadSnap = await tx.get(leadRef);
      if (!leadSnap.exists) {
        throw new Error("Lead not found");
      }

      const lead = leadSnap.data() || {};
      if (docTenantId(lead) !== tenantId) {
        throw new Error("Forbidden");
      }
      if (lead.dealId) {
        throw new Error("Lead already converted");
      }

      dealName = cleanString(lead.name || lead.company || "New Deal");
      leadEmail = cleanString(lead.email);
      leadPhone = cleanString(lead.phone);
      source = cleanString(lead.source);
      ownerUid = cleanString(lead.ownerUid) || null;
      ownerName = cleanString(lead.ownerName) || null;

      tx.set(dealRef, {
        tenantId,
        dealName,
        clientName: cleanString(lead.company || lead.name || ""),
        leadId,
        leadName: cleanString(lead.name),
        leadEmail,
        leadPhone,
        source,
        stage: "New",
        valueUsd: 0,
        probability: 10,
        ownerId: ownerUid,
        ownerName,
        isDeleted: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(
        leadRef,
        {
          status: "qualified",
          dealId: dealRef.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    await logEvent({
      tenantId,
      type: "lead.converted_to_deal",
      title: "Lead converted",
      description: `${dealName} converted to deal.`,
      entityType: "lead",
      entityId: leadId,
      actor: { uid: me.uid, name: me.name || me.fullName || "" },
      metadata: { dealId: dealRef.id },
    });

    const watcherIds = await getUserIdsByRoles(["admin", "super_admin", "sales_manager"], tenantId);
    await Promise.all(
      watcherIds.map((uid) =>
        createNotification({
          toUserId: uid,
          title: "Lead converted to deal",
          body: `${dealName} converted to a deal.`,
          entityType: "deal",
          entityId: dealRef.id,
          deepLink: "/sales_manager/deals",
          tenantId,
          createdBy: { uid: me.uid, name: me.name || me.fullName || "" },
        })
      )
    );

    return NextResponse.json({ ok: true, dealId: dealRef.id });
  } catch (err) {
    console.error("lead convert error:", err);
    return NextResponse.json({ ok: false, error: (err instanceof Error ? err.message : undefined) || "Unable to convert lead." }, { status: 500 });
  }
}
