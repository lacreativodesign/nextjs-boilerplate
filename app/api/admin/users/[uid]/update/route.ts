import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request, { params }: { params: { uid: string } }) {
  try {
    // GET TOKEN FROM COOKIE
    const cookieHeader = req.headers.get("cookie") || "";
    const token = cookieHeader
      .split("; ")
      .find((c) => c.startsWith("session="))
      ?.split("=")[1];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // VERIFY TOKEN
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(token);
    } catch (err) {
      return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
    }

    // LOAD SESSION USER FROM FIRESTORE
    const sessionSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!sessionSnap.exists) {
      return NextResponse.json({ error: "Session user not found" }, { status: 401 });
    }

    const sessionUser = sessionSnap.data();
    const isSuperAdmin = sessionUser.role === "super_admin";
    const isAdmin = sessionUser.role === "admin";

    // PERMISSION CHECK (OPTION B)
    if (!isSuperAdmin && !isAdmin) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    const uid = params.uid;
    const body = await req.json();

    // REQUIRED FIELDS
    if (!body.name || !body.email || !body.role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const newRole = String(body.role).toLowerCase();

    // OPTION B PERMISSION RULES
    if (isAdmin) {
      // Admin CANNOT give anyone super_admin role
      if (newRole === "super_admin") {
        return NextResponse.json(
          { error: "Admins cannot assign super_admin role" },
          { status: 403 }
        );
      }

      // Admin cannot change a super_admin account at all
      const targetSnap = await adminDb.collection("users").doc(uid).get();
      const target = targetSnap.data();

      if (target?.role === "super_admin") {
        return NextResponse.json(
          { error: "Admins cannot modify super_admin accounts" },
          { status: 403 }
        );
      }
    }

    // PAYLOAD
    const payload = {
      name: body.name,
      email: body.email,
      phone: body.phone || "",
      role: newRole,
      department: body.department || "",
      designation: body.designation || "",
      salary: body.salary ? Number(body.salary) : 0,
      monthlyTarget: body.monthlyTarget ? Number(body.monthlyTarget) : 0,
      commission: body.commission ? Number(body.commission) : 0,
      joiningDate: body.joiningDate || "",
      status: (body.status || "active").toLowerCase(),
      updatedAt: new Date().toISOString(),
    };

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
