import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    const list = await adminAuth.listUsers();
    const users = [];

    for (const user of list.users) {
      const snap = await adminDb.collection("users").doc(user.uid).get();
      users.push({
        uid: user.uid,
        email: user.email,
        role: snap.exists ? snap.data()?.role : "unknown",
      });
    }

    return NextResponse.json({ users });
  } catch (err) {
    console.error("Error fetching users:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
