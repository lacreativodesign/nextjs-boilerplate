import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { UserService } from "@/lib/users/user-service";
import { getCurrentUser, normalizeRole } from "@/app/api/admin/_utils";

export const dynamic = "force-dynamic";

function canManageUsers(role: string) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "super_admin" || normalized === "owner" || normalized === "manager";
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageUsers(me.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userDoc = await adminDb.collection("users").doc(params.id).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data() || {};
    if (userData.tenantId !== me.tenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await UserService.reactivateUser(params.id);

    await UserService.logActivity({
      tenantId: me.tenantId,
      userId: me.uid,
      type: "settings_change",
      action: "reactivated user",
      resourceType: "user",
      resourceId: params.id,
      resourceName: userData.name || userData.email,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error reactivating user:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to reactivate user" },
      { status: 500 }
    );
  }
}
