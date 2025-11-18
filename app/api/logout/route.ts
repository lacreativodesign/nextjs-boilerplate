import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifySession } from "@/lib/serverAuth";

export async function POST() {
  try {
    const c = cookies();
    const sessionCookie = c.get("lac_session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ success: false, message: "No session" });
    }

    // verify session
    const decoded = await verifySession(sessionCookie);
    const uid = decoded.uid;

    // Add logout timestamp into attendance logs
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

    await adminDb
      .collection("attendance")
      .doc(uid)
      .update({
        logs: adminDb.FieldValue.arrayUnion({
          type: "logout",
          timestamp: new Date().toISOString(),
          date: dateKey,
        }),
      });

    // Clear the session cookie
    c.set({
      name: "lac_session",
      value: "",
      path: "/",
      maxAge: 0,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Logout stamp error:", err);
    return NextResponse.json({ success: false, error: "Logout error" });
  }
          }
