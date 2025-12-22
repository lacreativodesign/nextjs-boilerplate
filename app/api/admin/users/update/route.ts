import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../_utils";

export const runtime = "nodejs";

/**
 * USERS: Update rules (LOCKED)
 * - SUPER_ADMIN + ADMIN: full access
 * - HR: can edit users EXCEPT email, and cannot edit ADMIN/SUPER_ADMIN users
 * - Email change: only SUPER_ADMIN/ADMIN (also UI keeps email disabled anyway)
 */
export async function PUT(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) return new NextResponse("Unauthorized", { status: 401 });

    const requesterRole = String(current.role || "").toLowerCase();
    const isAdmin = requesterRole === "admin" || requesterRole === "super_admin";
    const isHr = requesterRole === "hr";

    if (!isAdmin && !isHr) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || "").trim();
    if (!uid) return new NextResponse("Bad Request: uid required", { status: 400 });

    // Load target user
    const ref = adminDb.collection("users").doc(uid);
    const snap = await ref.get();

    if (!snap.exists) return new NextResponse("User not found", { status: 404 });

    const target = snap.data() || {};
    const targetRole = String(target?.role || "").toLowerCase();

    // HR cannot edit privileged accounts
    if (isHr && (targetRole === "admin" || targetRole === "super_admin")) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Also keep your existing rule: admin cannot modify super_admin users
    if (requesterRole === "admin" && targetRole === "super_admin") {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Build payload — whitelist only fields you actually store
    // NOTE: email is intentionally controlled below.
    const updates: Record<string, any> = {
      name: body?.name ?? target?.name ?? "",
      phone: body?.phone ?? target?.phone ?? "",
      cnic: body?.cnic ?? target?.cnic ?? "",
      dob: body?.dob ?? target?.dob ?? null,
      status: body?.status ?? target?.status ?? "active",

      role: body?.role ?? target?.role ?? targetRole,
      department: body?.department ?? target?.department ?? "",
      designation: body?.designation ?? target?.designation ?? "",
      joiningDate: body?.joiningDate ?? target?.joiningDate ?? null,

      salary: body?.salary ?? target?.salary ?? 0,
      monthlyTarget: body?.monthlyTarget ?? target?.monthlyTarget ?? 0,
      commission: body?.commission ?? target?.commission ?? 0,

      updatedAt: new Date().toISOString(),
      updatedBy: current.uid,
    };

    // Email rules:
    // - HR can NEVER change email
    // - ADMIN/SUPER_ADMIN can change email (but UI keeps disabled)
    // If the UI sends email anyway, we enforce this server-side.
    if (isAdmin) {
      // Allow (optional) email update if passed, else keep existing
      updates.email = body?.email ?? target?.email ?? "";
    } else {
      // Force keep existing email
      updates.email = target?.email ?? "";
    }

    // Prevent privilege escalation: nobody can set role to super_admin except super_admin
    if (String(updates.role || "").toLowerCase() === "super_admin" && requesterRole !== "super_admin") {
      updates.role = targetRole; // revert
    }

    await ref.set(updates, { merge: true });

    return NextResponse.json({ ok: true, uid });
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    return new NextResponse("Server error", { status: 500 });
  }
}
