import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDB } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { email, password, role } = await req.json();

    if (!email || !password || !role) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const auth = getAdminAuth();
    const db = getAdminDB();

    // 1. Create Firebase Auth user
    const user = await auth.createUser({
      email,
      password,
      emailVerified: true,
    });

    // 2. Store role in Firestore
    await db.collection("users").doc(user.uid).set({
      email,
      role,
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "User creation failed" },
      { status: 400 }
    );
  }
}
