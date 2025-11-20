import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole, isSuperAdmin } from "../_utils";

export const runtime = "nodejs";

export async function GET() {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // ADMIN: can only see non-admin users
    // SUPER_ADMIN: can see all
    let ref = adminDb.collection("users");

    if (!isSuperAdmin(current.role)) {
      ref = ref.where("role", "!=", "admin").where("role", "!=", "super_admin");
    }

    const snap = await ref.get();
    const list: any[] = [];

    snap.forEach((doc) => {
      list.push({
        uid: doc.id,
        ...doc.data(),
      });
    });

    return NextResponse.json(list);
  } catch (e: any) {
    console.error("Error list users:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
