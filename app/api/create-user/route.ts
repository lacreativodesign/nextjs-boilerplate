import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { email, password, role, name } = await req.json();

    if (!email || !password || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 1️⃣ Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name || "",
    });

    // 2️⃣ Store user in Firestore
    await adminDb.collection("users").doc(userRecord.uid).set({
      email,
      name: name || "",
      role,
      status: "active",
      createdAt: Date.now(),
    });

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (err: any) {
    console.error("Create user failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
