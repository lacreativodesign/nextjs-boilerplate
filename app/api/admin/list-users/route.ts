import { NextResponse } from "next/server";
import { getAdminDB } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    const db = getAdminDB();

    const snap = await db.collection("users").get();
    const users = snap.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ ok: true, users });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
