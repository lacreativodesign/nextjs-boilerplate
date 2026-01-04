import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "@/app/api/super-admin/_utils";
import { DEFAULT_MODULES } from "@/lib/tenant/constants";
import { writeAuditLog } from "@/lib/tenant/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { tenantId: string } }) {
  try {
    await requireSuperAdmin(req);
    const tenantId = params.tenantId;
    const snap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }
    const data = snap.data() || {};
    return NextResponse.json({
      ok: true,
      tenant: {
        id: snap.id,
        name: data.name || "",
        slug: data.slug || "",
        status: data.status || "active",
        brand: data.brand || null,
        modulesEnabled: data.modulesEnabled || DEFAULT_MODULES,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
      },
    });
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { tenantId: string } }) {
  try {
    const user = await requireSuperAdmin(req);
    const tenantId = params.tenantId;
    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (body?.name !== undefined) updates.name = String(body.name || "").trim();
    if (body?.slug !== undefined) updates.slug = String(body.slug || "").trim();
    if (body?.status !== undefined) updates.status = body.status === "suspended" ? "suspended" : "active";

    if (!Object.keys(updates).length) {
      return NextResponse.json({ ok: false, error: "No updates provided" }, { status: 400 });
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updates.updatedBy = user.uid;

    await adminDb.collection("tenants").doc(tenantId).set(updates, { merge: true });

    await writeAuditLog({
      tenantId,
      actorUserId: user.uid,
      actionType: "tenant_updated",
      entityType: "tenant",
      entityId: tenantId,
      metadata: updates,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
