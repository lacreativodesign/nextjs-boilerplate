import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole, isSuperAdmin } from "../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { uid, name, email, role, disabled } = await req.json();

    if (!uid) {
      return new NextResponse("Missing uid", { status: 400 });
    }

    const doc = await adminDb.collection("users").doc(uid).get();
    if (!doc.exists) {
      return new NextResponse("User not found", { status: 404 });
    }

    const currentData = doc.data();

    // Admin cannot update Admin or Super_Admin
    if (!isSuperAdmin(current.role)) {
      if (currentData?.role === "admin" || currentData?.role === "super_admin") {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    // Build update payload
    const updateAuth: any = {};
    const updateFirestore: any = {};

    if (name) {
      updateAuth.displayName = name;
      updateFirestore.name = name;
    }

    if (email) {
      updateAuth.email = email;
      updateFirestore.email = email;
    }

    if (typeof disabled === "boolean") {
      updateAuth.disabled = disabled;
      updateFirestore.disabled = disabled;
    }

    if (role) {
      // Only SUPER_ADMIN can change roles
      if (!isSuperAdmin(current.role)) {
        return new NextResponse("Only SUPER_ADMIN can change roles", {
          status: 403,
        });
      }
      updateFirestore.role = role;
      await adminAuth.setCustomUserClaims(uid, { role });
    }

    // Apply updates
    if (Object.keys(updateAuth).length > 0) {
      await adminAuth.updateUser(uid, updateAuth);
    }

    if (Object.keys(updateFirestore).length > 0) {
      await adminDb.collection("users").doc(uid).update(updateFirestore);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Error update user:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
