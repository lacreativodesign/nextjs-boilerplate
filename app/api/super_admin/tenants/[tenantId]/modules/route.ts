import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../../../_utils";
import { writeAuditLog } from "@/lib/tenant/audit";

export async function POST(req: NextRequest, { params }: { params: { tenantId: string } }) {
  try {
    const user = await requireSuperAdmin(req);
    const tenantId = params.tenantId;
    const body = await req.json().catch(() => ({}));
    const modulesEnabled = body?.modulesEnabled;

    if (!modulesEnabled || typeof modulesEnabled !== "object") {
      return NextResponse.json({ ok: false, error: "modulesEnabled is required" }, { status: 400 });
    }

    await adminDb.collection("tenants").doc(tenantId).set(
      {
        modulesEnabled,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true }
    );

    await writeAuditLog({
      tenantId,
      actorUserId: user.uid,
      actionType: "tenant_modules_updated",
      entityType: "tenant",
      entityId: tenantId,
      metadata: { modulesEnabled },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
