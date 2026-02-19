import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { hashInviteToken } from "@/lib/clientInvites";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const uid = String(body?.uid || "").trim();
    if (!token || !uid) {
      return NextResponse.json({ ok: false, error: "Missing token or uid." }, { status: 400 });
    }

    const tokenHash = hashInviteToken(token);
    const snap = await adminDb.collection("inviteTokens").where("tokenHash", "==", tokenHash).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ ok: false, error: "Invalid token." }, { status: 404 });
    }

    const doc = snap.docs[0];
    const data = doc.data() || {};
    const tenantId = normalizeTenantId(data.tenantId || null);

    if (docTenantId(data) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Invalid token." }, { status: 404 });
    }

    if (data.usedAt) {
      return NextResponse.json({ ok: false, error: "Invite already used." }, { status: 410 });
    }

    const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt || 0);
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ ok: false, error: "Invite expired." }, { status: 410 });
    }

    const email = String(data.email || "").trim().toLowerCase();
    const clientId = String(data.clientId || "");

    const clientSnap = await adminDb.collection("clients").doc(clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
    }
    if (docTenantId(clientSnap.data()) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    const existingUserSnap = await adminDb.collection("users").where("email", "==", email).limit(1).get();
    if (!existingUserSnap.empty && existingUserSnap.docs[0].id !== uid) {
      return NextResponse.json({ ok: false, error: "Email already in use." }, { status: 409 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    await adminDb.collection("users").doc(uid).set(
      {
        uid,
        email,
        role: "client",
        status: "active",
        clientId,
        tenantId,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    await adminDb.collection("clients").doc(clientId).set(
      {
        portalUserUid: uid,
        portalInviteAcceptedAt: now,
        updatedAt: now,
        tenantId,
      },
      { merge: true }
    );

    await doc.ref.set({ usedAt: now, usedByUid: uid }, { merge: true });

    const notifyIds = await getUserIdsByRoles(["admin", "super_admin", "am_manager"], tenantId);
    await Promise.all(
      notifyIds.map((adminUid) =>
        createNotification({
          toUserId: adminUid,
          title: "Client portal activated",
          body: `${email} activated their portal access.`,
          entityType: "client",
          entityId: clientId,
          deepLink: "/clients",
          tenantId,
        })
      )
    );

    await logEvent({
      tenantId,
      type: "client.portal_activated",
      title: "Client portal activated",
      description: `${email} activated portal access.`,
      entityType: "client",
      entityId: clientId,
      actor: { uid, name: email },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("invite complete error:", err);
    return NextResponse.json({ ok: false, error: "Unable to complete invite." }, { status: 500 });
  }
}
