import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "@/app/api/super_admin/_utils";
import { writeAuditLog } from "@/lib/tenant/audit";

export async function PATCH(req: NextRequest, { params }: { params: { uid: string } }) {
  try {
    const user = await requireSuperAdmin(req);
    const uid = params.uid;
    const body = await req.json().catch(() => ({}));

    const updates: Record<string, unknown> = {};

    if (body?.displayName !== undefined) updates.displayName = String(body.displayName || "").trim();
    if (body?.role !== undefined) updates.role = String(body.role || "").trim();
    if (body?.tenantId !== undefined) updates.tenantId = String(body.tenantId || "").trim();
    if (body?.status !== undefined) updates.status = body.status === "disabled" ? "disabled" : "active";

    if (!Object.keys(updates).length) {
      return NextResponse.json({ ok: false, error: "No updates provided" }, { status: 400 });
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await adminDb.collection("users").doc(uid).set(updates, { merge: true });

    if (updates.displayName) {
      await adminAuth.updateUser(uid, { displayName: updates.displayName as string });
    }

    await writeAuditLog({
      tenantId: (updates.tenantId as string) || null,
      actorUserId: user.uid,
      actionType: "user_updated",
      entityType: "user",
      entityId: uid,
      metadata: updates,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
