import { NextResponse } from "next/server";
import { adminDB } from "@/lib/firebaseAdmin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json(
        { error: "Missing uid parameter" },
        { status: 400 }
      );
    }

    const doc = await adminDB.collection("users").doc(uid).get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      uid,
      ...doc.data(),
    });
  } catch (err: any) {
    console.error("Get user error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
