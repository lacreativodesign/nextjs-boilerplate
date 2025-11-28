import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { uid, ...fields } = body;

    if (!uid) {
      return NextResponse.json({ error: "Missing user ID" }, { status: 400 });
    }

    // GET COOKIE
    const cookieHeader = req.headers.get("cookie") || "";
    const lacCookie = cookieHeader
      .split("; ")
      .find((c) => c.startsWith("lac_session="));

    if (!lacCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // PARSE ARRAY FROM COOKIE
    let token = "";
    try {
      const raw = decodeURIComponent(lacCookie.split("=")[1]);
      const arr = JSON.parse(raw);
      token = arr[0]; // first token is always the idToken
    } catch (err) {
      console.error("COOKIE PARSING ERROR:", err);
      return NextResponse.json({ error: "Invalid session cookie" }, { status: 401 });
    }

    // VERIFY TOKEN
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(token);
    } catch (err) {
      console.error("TOKEN VERIFY ERROR:", err);
      return NextResponse.json(
        { error: "Invalid session token" },
        { status: 401 }
      );
    }

    // LOAD SESSION USER
    const sessionSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!sessionSnap.exists) {
      return NextResponse.json(
        { error: "Session user not found" },
        { status: 401 }
      );
    }

    const sessionUser = sessionSnap.data();
    const isSuperAdmin = sessionUser.role === "super_admin";
    const isAdmin = sessionUser.role === "admin";

    // PERMISSION CHECK (OPTION B)
    if (!isSuperAdmin && !isAdmin) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // LOAD TARGET USER
    const targetSnap = await adminDb.collection("users").doc(uid).get();
    if (!targetSnap.exists) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    const targetUser = targetSnap.data();

    // ADMIN cannot modify super_admin
    if (isAdmin && targetUser.role === "super_admin") {
      return NextResponse.json(
        { error: "Admins cannot modify super_admin accounts" },
        { status: 403 }
      );
    }

    // ADMIN cannot assign super_admin role
    if (isAdmin && fields.role?.toLowerCase() === "super_admin") {
      return NextResponse.json(
        { error: "Admins cannot assign super_admin role" },
        { status: 403 }
      );
    }

    // PREP PAYLOAD
    const payload = {
      name: fields.name || "",
      email: fields.email || "",
      phone: fields.phone || "",
      role: fields.role ? fields.role.toLowerCase() : targetUser.role,
      department: fields.department || "",
      designation: fields.designation || "",
      salary: fields.salary ? Number(fields.salary) : 0,
      monthlyTarget: fields.monthlyTarget ? Number(fields.monthlyTarget) : 0,
      commission: fields.commission ? Number(fields.commission) : 0,
      joiningDate: fields.joiningDate || "",
      status: fields.status ? fields.status.toLowerCase() : "active",
      updatedAt: new Date().toISOString(),
    };

    // UPDATE FIRESTORE
    await adminDb.collection("users").doc(uid).update(payload);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
