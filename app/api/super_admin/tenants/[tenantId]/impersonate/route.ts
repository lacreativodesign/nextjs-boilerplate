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

    // Verify tenant exists
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) {
      return NextResponse.json(
        { ok: false, error: "Tenant not found" },
        { status: 404 }
      );
    }
    const tenantData = tenantSnap.data() || {};

    // Find the tenant's admin user
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

    // Create a custom token with impersonation claims
    const customToken = await adminAuth.createCustomToken(targetUid, {
      role: "admin",
      tenantId,
      isImpersonating: true,
      impersonatedBy: superAdmin.uid,
      impersonatedByEmail: superAdmin.email || "admin@bizosto.com",
    });

    // Audit log — every impersonation is recorded
    await writeAuditLog({
      tenantId: null,
      actorUserId: superAdmin.uid,
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
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
