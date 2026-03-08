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
    const name = String(body?.name || "").trim();
    const logoUrl = body?.logoUrl ? String(body.logoUrl).trim() : null;

    if (!name) {
      return NextResponse.json({ ok: false, error: "Brand name is required" }, { status: 400 });
    }

    await adminDb.collection("tenants").doc(tenantId).set(
      {
        brand: {
          name,
          logoUrl,
          locked: true,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true }
    );

    await writeAuditLog({
      tenantId,
      actorUserId: user.uid,
      actionType: "tenant_branding_updated",
      entityType: "tenant",
      entityId: tenantId,
      metadata: { name, logoUrl },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
