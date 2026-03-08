import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifySession } from "@/lib/serverAuth";

export async function POST(req: Request) {
  try {
    const { sessionCookie } = await req.json();
    if (!sessionCookie) return NextResponse.json({ success: false });

    const decoded = await verifySession(sessionCookie);
    const uid = decoded.uid;

    const now = new Date();
    const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

    await adminDb
      .collection("attendance")
      .doc(uid)
      .set(
        {
          logs: adminDb.FieldValue.arrayUnion({
            type: "login",
            timestamp: now.toISOString(),
            date: dateKey,
          }),
        },
        { merge: true }
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Login stamp error:", err);
    return NextResponse.json({ success: false });
  }
}
