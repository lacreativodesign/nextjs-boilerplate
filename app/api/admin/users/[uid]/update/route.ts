import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

const COOKIE_NAME = "lac_session";
const COOKIE_DOMAIN = ".lacreativo.com";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ----------------------------------------------------
    // 2. VERIFY SESSION COOKIE (IMPORTANT FIX)
    // ----------------------------------------------------
    let decoded;
    try {
      decoded = await adminAuth.verifySessionCookie(token, true);
    } catch (err) {
      console.error("SESSION COOKIE VERIFY ERROR:", err);
      return NextResponse.json(
        { error: "Invalid session token" },
        { status: 401 }
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
      return NextResponse.json(
        { error: "Session user not found" },
        { status: 401 }
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
      const targetSnap = await adminDb.collection("users").doc(uid).get();
      const target = targetSnap.data();

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

    // ----------------------------------------------------
    // 8. SAVE TO FIRESTORE
    // ----------------------------------------------------
    await adminDb.collection("users").doc(uid).update(payload);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    return NextResponse.json(
      { error: "Failed to update user." },
      { status: 500 }
    );
  }
}
