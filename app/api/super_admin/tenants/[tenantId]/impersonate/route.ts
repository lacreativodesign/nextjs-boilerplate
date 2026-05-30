import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../../../_utils";
import { writeAuditLog } from "@/lib/tenant/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  try {
    const superAdmin = await requireSuperAdmin(req);
    const tenantId = String(params?.tenantId || "").trim();

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required" },
        { status: 400 }
      );
    }

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) {
      return NextResponse.json(
        { ok: false, error: "Tenant not found" },
        { status: 404 }
      );
    }
    const tenantData = tenantSnap.data() || {};

    const usersSnap = await adminDb
      .collection("users")
      .where("tenantId", "==", tenantId)
      .where("role", "==", "admin")
      .limit(1)
      .get();

    if (usersSnap.empty) {
      return NextResponse.json(
        { ok: false, error: "No admin user found for this tenant" },
        { status: 404 }
      );
    }

    const targetUser = usersSnap.docs[0];
    const targetUid = targetUser.id;
    const targetData = targetUser.data() || {};

    const customToken = await adminAuth.createCustomToken(targetUid, {
      role: "admin",
      tenantId,
      isImpersonating: true,
      impersonatedBy: superAdmin.uid,
      impersonatedByEmail: superAdmin.email || "admin@bizosto.com",
    });

    await writeAuditLog({
      tenantId: null,
      actorUserId: superAdmin.uid,
      actorName: superAdmin.email || "super_admin",
      actorRole: "super_admin",
      actionType: "impersonation_started",
      entityType: "tenant",
      entityId: tenantId,
      metadata: {
        targetUid,
        targetEmail: targetData.email || "",
        tenantName: tenantData.name || tenantId,
        superAdminEmail: superAdmin.email || "",
      },
    });

    return NextResponse.json({
      ok: true,
      customToken,
      targetEmail: targetData.email || "",
      tenantName: tenantData.name || tenantId,
    });
  } catch (err) {
    const message = (err instanceof Error ? err.message : undefined) || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
