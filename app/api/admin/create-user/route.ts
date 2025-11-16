import { NextResponse } from "next/server";
import { adminAuth, adminDB } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { email, password, role } = await req.json();

    if (!email || !password || !role) {
      return NextResponse.json(
        { error: "Missing fields" },
        { status: 400 }
      );
    }

    // 1. Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
    });

    // 2. Save role in Firestore
    await adminDB.collection("users").doc(userRecord.uid).set({
      email,
      role,
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      uid: userRecord.uid,
    });
  } catch (err: any) {
    console.error("Create user error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
