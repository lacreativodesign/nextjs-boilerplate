import { NextResponse } from "next/server";
import { adminDB } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    const snapshot = await adminDB.collection("users").get();

    const users = snapshot.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ users });
  } catch (err: any) {
    console.error("List users error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
