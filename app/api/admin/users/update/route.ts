import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../_utils";

export const runtime = "nodejs";

function isAdminLike(role: string) {
  const r = String(role || "").toLowerCase();
  return r === "super_admin" || r === "admin";
}

function canEditUsers(role: string) {
  const r = String(role || "").toLowerCase();
  return r === "super_admin" || r === "admin" || r === "hr";
}

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const requesterRole = String(current.role || "").toLowerCase();
    if (!canEditUsers(requesterRole)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    const uid = String(body?.uid || "").trim();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const role = String(body?.role || "").trim();
    const department = String(body?.department || "").trim();

    if (!uid || !name || !email || !role || !department) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Pull existing doc to enforce email restriction
    const snap = await adminDb.collection("users").doc(uid).get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

    const existing = snap.data() || {};
    const existingEmail = String(existing?.email || "").trim();

    // ✅ Only admin/super_admin can change email
    const wantsEmailChange = existingEmail && existingEmail.toLowerCase() !== email.toLowerCase();
    if (wantsEmailChange && !isAdminLike(requesterRole)) {
      return NextResponse.json({ ok: false, error: "Only Admin / Super Admin can change email." }, { status: 403 });
    }

    // if admin changes email -> update Auth email too
    if (wantsEmailChange && isAdminLike(requesterRole)) {
      await adminAuth.updateUser(uid, { email });
    }

    const updateData = {
      // core
      name,
      email,
      phone: String(body?.phone || "").trim(),
      cnic: String(body?.cnic || "").trim(),
      dob: body?.dob ?? null,

      status: String(body?.status || "active").toLowerCase(),
      role: String(role).toLowerCase(),
      department,

      // ✅ correct key
      designation: String(body?.designation || "").trim(),
      joiningDate: body?.joiningDate ?? null,

      // numbers (nullable)
      salary: body?.salary === null || body?.salary === "" ? null : Number(body?.salary),
      monthlyTarget: body?.monthlyTarget === null || body?.monthlyTarget === "" ? null : Number(body?.monthlyTarget),
      commission: body?.commission === null || body?.commission === "" ? null : Number(body?.commission),

      updatedAt: new Date().toISOString(),
    };

    await adminDb.collection("users").doc(uid).update(updateData);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("UPDATE USER ERROR:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
