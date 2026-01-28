import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import { adminDb } from "../../../../../lib/firebaseAdmin";
import { createRoleNotifications } from "../../../../../lib/notifications";
import { writeAuditLog } from "../../../../../lib/tenant/audit";
import { requireTenantStripeConnect } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    const auth = await requireTenantStripeConnect();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantRef = adminDb.collection("tenants").doc(auth.user.tenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ ok: false, error: "Tenant not found." }, { status: 404 });
    }

    const stripeConnect = (tenantSnap.data()?.stripeConnect || {}) as Record<string, any>;
    if (stripeConnect.status !== "connected") {
      return NextResponse.json({ ok: true, status: "disconnected" });
    }

    await tenantRef.set(
      {
        "stripeConnect.enabled": false,
        "stripeConnect.status": "disconnected",
        "stripeConnect.accountId": null,
        "stripeConnect.accountEmail": null,
        "stripeConnect.disconnectedAt": admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAuditLog({
      tenantId: auth.user.tenantId,
      actorUserId: auth.user.uid,
      actorName: auth.user.displayName || auth.user.email || null,
      actorRole: auth.user.role,
      actionType: "stripe_connect_disconnected",
      entityType: "tenant",
      entityId: auth.user.tenantId,
      metadata: {
        stripeAccountId: stripeConnect.accountId || null,
        stripeAccountEmail: stripeConnect.accountEmail || null,
      },
    });

    await createRoleNotifications({
      tenantId: auth.user.tenantId,
      roles: ["admin"],
      title: "Stripe disconnected",
      body: "Stripe Connect has been disconnected. You can reconnect anytime.",
      type: "warning",
      priority: "normal",
      entityType: "tenant",
      entityId: auth.user.tenantId,
      deepLink: "/settings/payments",
      createdBy: { uid: auth.user.uid, name: auth.user.displayName || auth.user.email || "Tenant admin" },
      metadata: {
        stripeAccountId: stripeConnect.accountId || null,
        stripeAccountEmail: stripeConnect.accountEmail || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || "Unable to disconnect Stripe.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
