import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createClientInvite } from "@/lib/clientInvites";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { getCurrentUser, isAdminRole } from "../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const clientId = String(body?.clientId || "").trim();
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "Missing clientId" }, { status: 400 });
    }

    const tenantId = normalizeTenantId(current.tenantId);
    const clientSnap = await adminDb.collection("clients").doc(clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    const clientData = clientSnap.data() || {};
    if (docTenantId(clientData) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const email = String(clientData.primaryContactEmail || "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: false, error: "Client email missing" }, { status: 400 });
    }

    await createClientInvite({
      tenantId,
      email,
      clientId,
      createdByUid: current.uid,
    });

    await adminDb.collection("clients").doc(clientId).set(
      {
        portalInviteSentAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await logEvent({
      tenantId,
      type: "client.invite_sent",
      title: "Client invite sent",
      description: `Invite sent to ${email}.`,
      entityType: "client",
      entityId: clientId,
      actor: { uid: current.uid, name: current.name || current.fullName || "" },
    });

    const notifyIds = await getUserIdsByRoles(["admin", "super_admin", "am_manager"], tenantId);
    await Promise.all(
      notifyIds.map((uid) =>
        createNotification({
          toUserId: uid,
          title: "Client portal invite sent",
          body: `${clientData.companyName || "Client"} invite sent to ${email}.`,
          entityType: "client",
          entityId: clientId,
          deepLink: "/admin/clients",
          tenantId,
          createdBy: { uid: current.uid, name: current.name || current.fullName || "" },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("client invite send error:", err);
    return NextResponse.json({ ok: false, error: "Unable to send invite." }, { status: 500 });
  }
}
