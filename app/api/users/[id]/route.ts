import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { UserService } from "@/lib/users/user-service";
import { getCurrentUser, normalizeRole } from "@/app/api/admin/_utils";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  title: z.string().max(120).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  avatar: z.string().url().optional().nullable(),
  bio: z.string().max(1000).optional().nullable(),
  phoneNumber: z.string().max(40).optional().nullable(),
  timezone: z.string().max(80).optional().nullable(),
  language: z.string().max(80).optional().nullable(),
  address: z
    .object({
      street: z.string().max(200).optional().nullable(),
      city: z.string().max(120).optional().nullable(),
      state: z.string().max(120).optional().nullable(),
      zipCode: z.string().max(40).optional().nullable(),
      country: z.string().max(120).optional().nullable(),
    })
    .optional(),
  preferences: z
    .object({
      emailNotifications: z.boolean(),
      desktopNotifications: z.boolean(),
      weeklyDigest: z.boolean(),
      theme: z.enum(["light", "dark", "auto"]).optional(),
    })
    .optional(),
  skills: z.array(z.string().min(1)).optional(),
  certifications: z.array(z.string().min(1)).optional(),
  linkedIn: z.string().url().optional().nullable(),
  github: z.string().url().optional().nullable(),
});

function canManageUsers(role: string) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "super_admin" || normalized === "owner" || normalized === "manager";
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    if (params.id !== me.uid && !canManageUsers(me.role)) {
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

    const updates = {
      ...data,
      "onboardingSteps.profileSetup": true,
    } as Record<string, unknown>;

    await UserService.updateUserProfile(params.id, updates);

    if (data.name) {
      await adminDb.collection("users").doc(params.id).update({ name: data.name, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    await UserService.logActivity({
      tenantId: me.tenantId,
      userId: me.uid,
      type: "profile_update",
      action: "updated user profile",
      resourceType: "user_profile",
      resourceId: params.id,
      resourceName: data.name || userData.name || userData.email,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
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

    await UserService.deactivateUser(params.id);

    await UserService.logActivity({
      tenantId: me.tenantId,
      userId: me.uid,
      type: "settings_change",
      action: "deactivated user",
      resourceType: "user",
      resourceId: params.id,
      resourceName: userData.name || userData.email,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deactivating user:", error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || "Failed to deactivate user" },
      { status: 500 }
    );
  }
}
