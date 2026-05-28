import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, normalizeRole } from "../../../_utils";
import { createHrEvent, isAdminLike, isHrRole } from "../../_utils";

export const runtime = "nodejs";

function normalizeString(incoming: any, existingValue: any = "") {
  if (incoming === undefined || incoming === null || incoming === "") return String(existingValue || "");
  return String(incoming || "").trim();
}

function normalizeNumber(incoming: any, existingValue: any = null) {
  if (incoming === undefined || incoming === "") return existingValue ?? null;
  if (incoming === null) return null;
  const num = Number(incoming);
  return Number.isFinite(num) ? num : existingValue ?? null;
}

function normalizeDate(incoming: any, existingValue: any = null) {
  if (incoming === undefined || incoming === "") return existingValue ?? null;
  if (incoming === null) return null;
  return incoming;
}

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const requesterRole = normalizeRole(current.role);
    if (!isAdminLike(requesterRole) && !isHrRole(requesterRole)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || "").trim();
    if (!uid) {
      return NextResponse.json({ ok: false, error: "Missing user id" }, { status: 400 });
    }

    const snap = await adminDb.collection("users").doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const existing = snap.data() || {};
    const isSuperAdmin = requesterRole === "super_admin";
    if (!isSuperAdmin && String(existing.tenantId || "") !== String(current.tenantId || "")) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const existingRole = normalizeRole(existing?.role || "");

    if (requesterRole !== "super_admin" && existingRole === "super_admin") {
      return NextResponse.json({ ok: false, error: "Cannot modify super admin accounts." }, { status: 403 });
    }

    const requestedRole = normalizeRole(body?.role || existingRole || "");
    if (requesterRole !== "super_admin" && requestedRole === "super_admin") {
      return NextResponse.json({ ok: false, error: "Cannot assign super admin role." }, { status: 403 });
    }

    const email = String(existing?.email || "").trim();
    const requestedStatus = body?.status;
    const statusAllowed = isAdminLike(requesterRole);
    const status = statusAllowed
      ? normalizeString(requestedStatus, existing?.status || "active").toLowerCase()
      : normalizeString(existing?.status || "active", existing?.status || "active").toLowerCase();

    const updateData = {
      name: normalizeString(body?.name, existing?.name),
      email,
      phone: normalizeString(body?.phone, existing?.phone),
      cnic: normalizeString(body?.cnic, existing?.cnic),
      dob: normalizeDate(body?.dob, existing?.dob),
      status,
      role: requestedRole || existingRole,
      department: normalizeString(body?.department, existing?.department),
      designation: normalizeString(body?.designation, existing?.designation),
      joiningDate: normalizeDate(body?.joiningDate, existing?.joiningDate),
      salary: normalizeNumber(body?.salary, existing?.salary),
      monthlyTarget: normalizeNumber(body?.monthlyTarget, existing?.monthlyTarget),
      commission: normalizeNumber(body?.commission, existing?.commission),
      updatedAt: new Date().toISOString(),
    };

    if (!updateData.name || !updateData.role || !updateData.department || !updateData.email) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    await adminDb.collection("users").doc(uid).update(updateData);

    if (requestedRole && requestedRole !== existingRole) {
      await createHrEvent({
        type: "hr.role_changed",
        title: "Role updated",
        description: `${updateData.name} role changed to ${requestedRole}.`,
        entityType: "user",
        entityId: uid,
        createdByUid: current.uid,
        createdByName: current.name || current.email || "Admin",
        metadata: { from: existingRole, to: requestedRole },
      });
    }

    await createHrEvent({
      type: "hr.user_updated",
      title: "User updated",
      description: `${updateData.name} profile updated.`,
      entityType: "user",
      entityId: uid,
      createdByUid: current.uid,
      createdByName: current.name || current.email || "Admin",
    });

    return NextResponse.json({
      ok: true,
      user: {
        uid,
        ...existing,
        ...updateData,
        updatedAt: updateData.updatedAt || new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("HR employees update error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
