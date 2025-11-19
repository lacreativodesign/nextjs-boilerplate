import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../_utils";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");

    if (!uid) return new NextResponse("Missing uid", { status: 400 });

    const snap = await adminDb.collection("users").doc(uid).get();
    if (!snap.exists) {
      return new NextResponse("User not found", { status: 404 });
    }

    return NextResponse.json({ user: snap.data() });
  } catch (e: any) {
    console.error("Error get user:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
