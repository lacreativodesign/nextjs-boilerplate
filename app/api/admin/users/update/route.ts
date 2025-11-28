import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { uid, ...fields } = body;

    if (!uid) {
      return NextResponse.json({ error: "Missing user ID" }, { status: 400 });
    }

    // 1) EXTRACT lac_session COOKIE (single string)
    const cookieHeader = req.headers.get("cookie") || "";
    const lacCookie = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("lac_session="));

    if (!lacCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionCookie = decodeURIComponent(lacCookie.split("=", 2)[1] || "");

    if (!sessionCookie) {
      return NextResponse.json({ error: "Invalid session cookie" }, { status: 401 });
    }

    // 2) VERIFY SESSION COOKIE (this is how session-login created it)
    let decoded;
    try {
      decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    } catch (err) {
      console.error("verifySessionCookie error:", err);
      return NextResponse.json({ error: "Invalid session cookie" }, { status: 401 });
    }

    const sessionUid = decoded.uid as string;

    // 3) LOAD SESSION USER FROM FIRESTORE
    const sessionSnap = await adminDb.collection("users").doc(sessionUid).get();
    if (!sessionSnap.exists) {
      return NextResponse.json(
        { error: "Session user not found" },
        { status: 401 }
      );
    }

    const sessionUser = sessionSnap.data() || {};
    const sessionRole = (sessionUser.role || "").toLowerCase();

    const isSuperAdmin = sessionRole === "super_admin";
    const isAdmin = sessionRole === "admin";

    // 🔐 OPTION B PERMISSIONS:
    // super_admin → full access
    // admin       → full access EXCEPT:
    //               - cannot edit super_admin accounts
    //               - cannot assign super_admin role
    if (!isSuperAdmin && !isAdmin) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // 4) LOAD TARGET USER
    const targetSnap = await adminDb.collection("users").doc(uid).get();
    if (!targetSnap.exists) {
      return NextResponse.json(
        { error: "Target user not found" },
        { status: 404 }
      );
    }

    const targetUser = targetSnap.data() || {};
    const targetRole = (targetUser.role || "").toLowerCase();

    // Admin cannot touch super_admin accounts
    if (isAdmin && targetRole === "super_admin") {
      return NextResponse.json(
        { error: "Admins cannot modify super_admin accounts" },
        { status: 403 }
      );
    }

    const newRole = fields.role ? String(fields.role).toLowerCase() : targetRole;

    // Admin cannot assign super_admin role
    if (isAdmin && newRole === "super_admin") {
      return NextResponse.json(
        { error: "Admins cannot assign super_admin role" },
        { status: 403 }
      );
    }

    // 5) BUILD CLEAN PAYLOAD
    const payload = {
      name: fields.name || "",
      email: fields.email || "",
      phone: fields.phone || "",
      role: newRole,
      department: fields.department || "",
      designation: fields.designation || "",
      salary: fields.salary ? Number(fields.salary) : 0,
      monthlyTarget: fields.monthlyTarget ? Number(fields.monthlyTarget) : 0,
      commission: fields.commission ? Number(fields.commission) : 0,
      joiningDate: fields.joiningDate || "",
      status: fields.status ? String(fields.status).toLowerCase() : "active",
      updatedAt: new Date().toISOString(),
    };

    // 6) UPDATE FIRESTORE
    await adminDb.collection("users").doc(uid).update(payload);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
