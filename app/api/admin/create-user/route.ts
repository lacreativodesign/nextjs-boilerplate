import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, normalizeRole } from "../_utils";
import { assertPermission, Permission } from "../../../../lib/permissions";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requesterRole = normalizeRole(current.role);
    try {
      assertPermission(requesterRole, Permission.ManageUsers);
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email, password, role, tenantId: requestedTenantId } = await req.json();
    const normalizedRole = normalizeRole(role);
    try {
      assertPermission(requesterRole, Permission.ManageRoles);
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!email || !password || !normalizedRole) {
      return NextResponse.json(
        { error: "Email, password, and role are required." },
        { status: 400 }
      );
    }

    if (requesterRole !== "super_admin" && normalizedRole === "super_admin") {
      return NextResponse.json({ error: "Admins cannot assign super_admin role." }, { status: 403 });
    }

    const tenantId =
      requesterRole === "super_admin"
        ? String(requestedTenantId || current.tenantId || DEFAULT_TENANT_ID)
        : String(current.tenantId || DEFAULT_TENANT_ID);

    // 1) Create Firebase Auth user
    const userRecord = await adminAuth().createUser({
      email,
      password,
    });

    // 2) Store user profile in Firestore
    await adminDb().collection("users").doc(userRecord.uid).set({
      email,
      role: normalizedRole,
      tenantId,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json(
      { success: true, uid: userRecord.uid },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong" },
      { status: 500 }
    );
  }
}
