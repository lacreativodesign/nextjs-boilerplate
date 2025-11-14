import { NextResponse } from "next/server";
import { getAdminDB } from "@/lib/firebaseAdmin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");

    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

    const db = getAdminDB();
    const ref = await db.collection("users").doc(uid).get();

    if (!ref.exists)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({ user: ref.data() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
