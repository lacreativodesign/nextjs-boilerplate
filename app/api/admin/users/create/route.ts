import { NextResponse } from "next/server";
import crypto from "crypto";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../_utils";
import { createPasswordSetupToken, sendSetPasswordEmail } from "@/lib/passwordSetup";
import { assertPermission, Permission } from "../../../../lib/permissions";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { createUserSchema } from "@/lib/validations/user";
import { validateRequest } from "@/lib/validations/validate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // 1) Get current logged-in user from existing util
    const current = await getCurrentUser();
    if (!current) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const currentRole = (current.role || "").toLowerCase();

    // 2) Only admin / super_admin / other privileged roles allowed
    if (!isAdminRole(currentRole)) {
      return NextResponse.json(
        { error: "Only admin users can create new users" },
        { status: 403 }
      );
    }

    try {
      assertPermission(currentRole, Permission.ManageUsers);
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3) Parse body
    const body = await req.json();
    const displayNameInput = String(body?.name || body?.fullName || body?.displayName || "").trim();

    const validatedData = validateRequest(createUserSchema, {
      email: body?.email,
      displayName: displayNameInput,
      role: body?.role,
      tenantId: current.tenantId || body?.tenantId || "",
      phone: body?.phone,
      department: body?.department,
    });

    const {
      email,
      displayName,
      role,
      tenantId,
      phone,
      department,
    } = validatedData;

    const {
      password,
      designation,
      salary,
      monthlyTarget,
      commission,
      joiningDate,
      cnic,
      dob,
      status,
    } = body || {};

    try {
      assertPermission(currentRole, Permission.ManageRoles);
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!canManageRole(role)) {
      return NextResponse.json(
        { error: "Permission denied for selected role" },
        { status: 403 }
      );
    }

    const targetRole = (role || "").toLowerCase();
    const passwordToUse = String(password || "").trim() || crypto.randomBytes(16).toString("hex");

    // 5) Check duplicate email
    const existingUser = await adminAuth
      .getUserByEmail(email)
      .catch(() => null);
    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }

    // 6) Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password: passwordToUse,
      displayName,
      disabled: status === "disabled",
    });

    // 7) Assign custom claims
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: targetRole });

    // 8) Save user document in Firestore
    await adminDb.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      name: displayName,
      email,
      role: targetRole,
      tenantId,
      phone: phone || "",
      department: department || "",
      designation: designation || "",
      salary: salary ?? null,
      monthlyTarget: monthlyTarget ?? null,
      commission: commission ?? null,
      joiningDate: joiningDate || null,
      status: status || "active",
      cnic: cnic || "",
      dob: dob || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: current.uid,
    });

    const tokenData = await createPasswordSetupToken({
      uid: userRecord.uid,
      email,
      createdBy: current.uid,
    });

    const emailResult = await sendSetPasswordEmail({ email, link: tokenData.link });

    // 9) Log admin activity
    await adminDb.collection("admin_activity").add({
      action: "create_user",
      performedBy: current.uid,
      performedByRole: currentRole,
      targetUser: {
        uid: userRecord.uid,
        email,
        role: targetRole,
      },
      timestamp: new Date().toISOString(),
    });

    // 10) Respond
    return NextResponse.json({
      success: true,
      uid: userRecord.uid,
      setPasswordLink: emailResult.sent ? undefined : tokenData.link,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
    });
  } catch (e: any) {
    console.error("Error create user:", e);
    const finalError = e instanceof SyntaxError
      ? new AppError({
          message: "Invalid JSON body",
          code: "VALIDATION_ERROR",
          status: 400,
        })
      : e;
    const { status, body } = resolveErrorResponse(finalError, {
      fallbackMessage: "Unable to create user.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}

// Same helper logic as you already had
function canManageRole(targetRole: string) {
  const r = (targetRole || "").toLowerCase();
  // super_admin / admin allowed to manage all roles except restricting logic already implemented where needed
  return [
    "super_admin",
    "admin",
    "sales_manager",
    "production_manager",
    "am_manager",
    "sales",
    "am",
    "hr",
    "finance",
    "production",
  ].includes(r);
}
