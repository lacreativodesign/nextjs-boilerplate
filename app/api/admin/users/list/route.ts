export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../_utils";

export const runtime = "nodejs";

export async function GET() {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Get users from Firestore "users" collection
    const snap = await adminDb.collection("users").get();

    const users: any[] = [];
    snap.forEach((doc) => {
      const data = doc.data();
      users.push({
        uid: doc.id,
        name: data.name,
        email: data.email,
        role: data.role,
        disabled: data.disabled || false,
        createdAt: data.createdAt || null,
      });
    });

    return NextResponse.json({ users });
  } catch (e: any) {
    console.error("Error list users:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
