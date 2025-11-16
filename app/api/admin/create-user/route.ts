import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { email, password, role } = await req.json();

    if (!email || !password || !role) {
      return NextResponse.json(
        { error: "Email, password, and role are required." },
        { status: 400 }
      );
    }

    // 1) Create Firebase Auth user
    const userRecord = await adminAuth().createUser({
      email,
      password,
    });

    // 2) Store user profile in Firestore
    await adminDb().collection("users").doc(userRecord.uid).set({
      email,
      role,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json(
      { success: true, uid: userRecord.uid },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong" },
      { status: 500 }
    );
  }
}
