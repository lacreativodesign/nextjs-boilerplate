import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const { action, details } = await req.json();

    if (!action) {
      return new NextResponse("Missing action", { status: 400 });
    }

    await adminDb.collection("activity_logs").add({
      userId: user.uid,
      role: user.role,
      action,
      details: details || "",
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Activity add error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
