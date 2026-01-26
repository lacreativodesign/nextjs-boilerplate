import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, normalizeRole } from "../admin/_utils";
import { assertPermission, Permission } from "../../../lib/permissions";
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

    const { email, password, role, name, tenantId: requestedTenantId } = await req.json();
    const normalizedRole = normalizeRole(role);

    if (!email || !password || !normalizedRole) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    try {
      assertPermission(requesterRole, Permission.ManageRoles);
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (requesterRole !== "super_admin" && normalizedRole === "super_admin") {
      return NextResponse.json({ error: "Admins cannot assign super_admin role." }, { status: 403 });
    }

    const tenantId =
      requesterRole === "super_admin"
        ? String(requestedTenantId || current.tenantId || DEFAULT_TENANT_ID)
        : String(current.tenantId || DEFAULT_TENANT_ID);

    // 1️⃣ Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name || "",
    });

    // 2️⃣ Store user in Firestore
    await adminDb.collection("users").doc(userRecord.uid).set({
      email,
      name: name || "",
      role: normalizedRole,
      tenantId,
      status: "active",
      createdAt: Date.now(),
    });

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (err: any) {
    console.error("Create user failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
