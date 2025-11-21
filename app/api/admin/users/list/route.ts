import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../../_utils";

export const runtime = "nodejs";

export async function GET() {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const snap = await adminDb.collection("users").get();

    const list = snap.docs.map((d) => ({
      uid: d.id,
      ...d.data(),
    }));

    return NextResponse.json(list);
  } catch (e) {
    console.error("Error list users:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
