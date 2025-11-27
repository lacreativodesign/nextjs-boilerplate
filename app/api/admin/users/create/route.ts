import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth, firestore } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const token = cookies().get("lac_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Use admin.auth().verifyIdToken
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const currentUid = decoded.uid;
    const currentUserDoc = await firestore.collection("users").doc(currentUid).get();
    if (!currentUserDoc.exists) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const currentRole = (currentUserDoc.data()?.role || "").toLowerCase();
    if (currentRole !== "admin" && currentRole !== "super_admin") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const { name, email, password, role, phone, department, designation, salary, monthlyTarget, commission, joiningDate, status } = body;

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const roleLower = role.toLowerCase();
    if (currentRole === "admin" && (roleLower === "admin" || roleLower === "super_admin")) {
      return NextResponse.json({ error: "Admins cannot create admin or super_admin users" }, { status: 403 });
    }

    const newUser = await auth.createUser({ email, password, displayName: name, disabled: status === "disabled" });
    const uid = newUser.uid;

    await firestore.collection("users").doc(uid).set({
      uid,
      name,
      email,
      role: roleLower,
      phone: phone || "",
      department: department || "",
      designation: designation || "",
      salary: salary || "",
      monthlyTarget: monthlyTarget || "",
      commission: commission || "",
      joiningDate: joiningDate || "",
      status: status || "active",
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
      createdBy: currentUid,
    });

    await firestore.collection("admin_activity").add({
      action: "create_user",
      targetUser: uid,
      role: roleLower,
      createdBy: currentUid,
      timestamp: firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Create user error:", error);
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 });
  }
}
