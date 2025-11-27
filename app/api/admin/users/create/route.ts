import { NextResponse } from "next/server";
import { adminAuth, adminDB } from "@/lib/firebaseAdmin";

export const runtime = "nodejs"; // IMPORTANT

export async function POST(req: Request) {
  try {
    const { displayName, email, password, role } = await req.json();

    if (!email || !password || !displayName || !role) {
      return NextResponse.json(
        { error: "Missing fields" },
        { status: 400 }
      );
    }

    // Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      displayName,
      email,
      password,
    });

    // Save role in Firestore
    await adminDB
      .collection("users")
      .doc(userRecord.uid)
      .set({
        displayName,
        email,
        role,
        createdAt: Date.now(),
      });

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (error: any) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create user" },
      { status: 500 }
    );
  }
}
