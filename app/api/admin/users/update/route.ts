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

    const body = await req.json();
    const { uid, name, email, role, disabled } = body;

    if (!uid) return new NextResponse("Missing uid", { status: 400 });

    // Load target user
    const snap = await adminDb.collection("users").doc(uid).get();
    if (!snap.exists) return new NextResponse("User not found", { status: 404 });
    const existing = snap.data() || {};

    const updates: any = {
      name,
      role,
      disabled: !!disabled,
    };

    // Email & role change security
    const isEditingAdminOrSuper =
      existing.role === "admin" || existing.role === "super_admin";

    // Only super_admin can change admin/super_admin email or role
    if (isEditingAdminOrSuper && !isSuperAdmin(current.role)) {
      return new NextResponse("Only Super Admin can modify Admin/Super Admin", {
        status: 403,
      });
    }

    // Only admins can change email at all – not normal roles
    if (email && email !== existing.email) {
      if (!isAdminRole(current.role)) {
        return new NextResponse("Only Admin can change email", { status: 403 });
      }

      // Update email in Auth and Firestore
      await adminAuth.updateUser(uid, { email });
      updates.email = email;
    }

    // Update display name in Auth
    if (name && name !== existing.name) {
      await adminAuth.updateUser(uid, { displayName: name });
    }

    // Update custom claims for role if changed
    if (role && role !== existing.role) {
      await adminAuth.setCustomUserClaims(uid, { role });
    }

    await adminDb.collection("users").doc(uid).update(updates);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Error update user:", e);
    return new NextResponse("Server error", { status: 500 });
  }
                                          }
