import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { name, email, password, role } = body;

    if (!email || !password || !role) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      disabled: false,
    });

    // Set custom claims for role
    await adminAuth.setCustomUserClaims(userRecord.uid, { role });

    // Store profile in Firestore
    await adminDb.collection("users").doc(userRecord.uid).set({
      name,
      email,
      role,
      disabled: false,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ uid: userRecord.uid });
  } catch (e: any) {
    console.error("Error create user:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
