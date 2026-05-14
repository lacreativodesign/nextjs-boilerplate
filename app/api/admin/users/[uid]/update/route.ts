import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { logEvent } from "@/lib/audit";
import { assertPermission, Permission } from "../../../../../lib/permissions";

const COOKIE_NAME = "lac_session";
function getCookieDomain(hostname: string): string | undefined {
  if (hostname === "localhost" || hostname === "127.0.0.1") return undefined;
  const parts = hostname.split(".");
  if (parts.length >= 2) return `.${parts.slice(-2).join(".")}`;
  return undefined;
}

function clearSessionCookie(response: NextResponse, request: Request) {
  const hostname = new URL(request.url).hostname;
  const cookieDomain = getCookieDomain(hostname);
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    domain: cookieDomain,
    maxAge: 0,
  });
  return response;
}

export async function POST(
  req: Request,
  { params }: { params: { uid: string } }
) {
  try {
    // ----------------------------------------------------
    // 1. READ SESSION COOKIE (lac_session)
    // ----------------------------------------------------
    const cookieHeader = req.headers.get("cookie") || "";
    const token = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE_NAME}=`))
      ?.split("=")[1];

    if (!token) {
      return clearSessionCookie(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), req);
    }

    // ----------------------------------------------------
    // 2. VERIFY SESSION COOKIE (IMPORTANT FIX)
    // ----------------------------------------------------
    let decoded;
    try {
      decoded = await adminAuth.verifySessionCookie(token, true);
    } catch (err) {
      console.error("SESSION COOKIE VERIFY ERROR:", err);
      return clearSessionCookie(
        NextResponse.json(
          { error: "Invalid session token" },
          { status: 401 }
        ),
        req
      );
    }

    // ----------------------------------------------------
    // 3. LOAD SESSION USER (the one performing update)
    // ----------------------------------------------------
    const sessionSnap = await adminDb
      .collection("users")
      .doc(decoded.uid)
      .get();

    if (!sessionSnap.exists) {
      return clearSessionCookie(
        NextResponse.json(
          { error: "Session user not found" },
          { status: 401 }
        ),
        req
      );
    }

    const sessionUser = sessionSnap.data();
    const isSuperAdmin = sessionUser.role === "super_admin";
    const isAdmin = sessionUser.role === "admin";

    // ----------------------------------------------------
    // 4. PERMISSION CHECK (YOUR OPTION A RULES)
    // ----------------------------------------------------
    if (!isSuperAdmin && !isAdmin) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    try {
      assertPermission(sessionUser.role, Permission.ManageUsers);
    } catch {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const uid = params.uid;
    const body = await req.json();

    // ----------------------------------------------------
    // 5. VALIDATE REQUIRED FIELDS
    // ----------------------------------------------------
    if (!body.name || !body.email || !body.role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const newRole = String(body.role).toLowerCase();
    if (newRole === "super_admin") {
      if (!sessionUser || sessionUser.role !== "super_admin") {
        return NextResponse.json(
          { error: "Cannot assign super_admin role." },
          { status: 403 }
        );
      }
    }
    const targetSnap = await adminDb.collection("users").doc(uid).get();
    const target = targetSnap.exists ? targetSnap.data() : null;
    const existingUser = target || {};
    const existingRole = String(target?.role || "").toLowerCase();

    if (existingRole && newRole && newRole !== existingRole) {
      try {
        assertPermission(sessionUser.role, Permission.ManageRoles);
      } catch {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 });
      }
    }

    // ----------------------------------------------------
    // 6. ADMIN RESTRICTIONS (CANNOT TOUCH SUPER ADMIN)
    // ----------------------------------------------------
    if (isAdmin) {
      // Admin cannot assign super_admin role
      if (newRole === "super_admin") {
        return NextResponse.json(
          { error: "Admins cannot assign super_admin role" },
          { status: 403 }
        );
      }

      // Admin cannot modify super_admin accounts at all
      if (target?.role === "super_admin") {
        return NextResponse.json(
          { error: "Admins cannot modify super_admin accounts" },
          { status: 403 }
        );
      }
    }

    // ----------------------------------------------------
    // 7. BUILD PAYLOAD (matches Firestore exactly)
    // ----------------------------------------------------
    const payload = {
      name: body.name,
      email: body.email,
      phone: body.phone || "",
      role: newRole,
      department: body.department || "",
      designation: body.designation || "",
      salary: body.salary ? Number(body.salary) : null,
      monthlyTarget: body.monthlyTarget ? Number(body.monthlyTarget) : null,
      commission: body.commission ? Number(body.commission) : null,
      joiningDate: body.joiningDate || null,
      status: (body.status || "active").toLowerCase(),
      cnic: body.cnic || "",
      dob: body.dob || null,
      updatedAt: new Date().toISOString(),
    };

    const changes = Object.entries(payload)
      .filter(([field]) => field !== "updatedAt")
      .filter(([field, value]) => value !== (existingUser as Record<string, unknown>)[field])
      .map(([field, value]) => ({
        field,
        oldValue: (existingUser as Record<string, unknown>)[field],
        newValue: value,
      }));

    // ----------------------------------------------------
    // 8. SAVE TO FIRESTORE
    // ----------------------------------------------------
    await adminDb.collection("users").doc(uid).update(payload);

    if (changes.length) {
      try {
        await logEvent({
          type: "user.updated",
          title: "User updated",
          description: `${payload.name} profile updated.`,
          entityType: "user",
          entityId: uid,
          actor: { uid: decoded.uid, name: sessionUser.name || sessionUser.email || "" },
          audit: {
            action: "update",
            resource: "user",
            changes,
          },
        });
      } catch (auditError) {
        console.error("audit log error:", auditError);
      }
    }

    if (existingRole && newRole && newRole !== existingRole) {
      try {
        await logEvent({
          type: "user.role_changed",
          title: "Role updated",
          description: `${payload.name} role changed to ${newRole}.`,
          entityType: "user",
          entityId: uid,
          actor: { uid: decoded.uid, name: sessionUser.name || sessionUser.email || "" },
          metadata: { from: existingRole, to: newRole },
          audit: {
            action: "role_changed",
            resource: "user",
            changes: [
              {
                field: "role",
                oldValue: existingRole,
                newValue: newRole,
              },
            ],
          },
        });
      } catch (auditError) {
        console.error("audit log error:", auditError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    return NextResponse.json(
      { error: "Failed to update user." },
      { status: 500 }
    );
  }
}
