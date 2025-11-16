import { NextResponse } from "next/server";
import { getAdminDB } from "@/lib/firebaseAdmin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ error: "Missing UID" }, { status: 400 });
    }

    const db = getAdminDB();
    const doc = await db.collection("users").doc(uid).get();

    if (!doc.exists) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({ user: { uid, ...doc.data() } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
