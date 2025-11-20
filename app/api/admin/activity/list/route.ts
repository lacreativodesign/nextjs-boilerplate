export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUser, isAdminRole } from "../../users/_utils";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const snap = await adminDb
      .collection("activity_logs")
      .orderBy("timestamp", "desc")
      .limit(200)
      .get();

    const logs: any[] = [];
    snap.forEach((doc) => logs.push({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ logs });
  } catch (e) {
    console.error("Activity list error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
