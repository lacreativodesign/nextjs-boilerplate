import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, normalizeRole } from "../_utils";
import { assertPermission, Permission } from "../../../../lib/permissions";

async function handleGet(uid: string | null) {
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

  if (!uid) {
    return NextResponse.json({ error: "User ID is required" }, { status: 400 });
  }

  const userDoc = await adminDb.collection("users").doc(uid).get();

  if (!userDoc.exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userData = userDoc.data() || {};
  const targetRole = normalizeRole(userData.role);
  const targetTenantId = String(userData.tenantId || "");
  const requesterTenantId = String(current.tenantId || "");

  if (requesterRole !== "super_admin" && targetRole === "super_admin") {
    return NextResponse.json({ error: "Admins cannot access super_admin accounts." }, { status: 403 });
  }

  if (requesterRole !== "super_admin" && targetTenantId && requesterTenantId && targetTenantId !== requesterTenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    user: { uid, ...userData },
    data: userData,
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");
    return await handleGet(uid);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch user" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { uid } = await req.json();
    return await handleGet(uid || null);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch user" }, { status: 500 });
  }
}
