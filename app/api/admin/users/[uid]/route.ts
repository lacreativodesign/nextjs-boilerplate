import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../../_utils";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { uid: string } }
) {
  try {
    const current = await getCurrentUser();

    if (!current) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const requesterRole = String(current.role || "").toLowerCase();
    const requestedUid = params.uid;

    // Roles allowed to fetch ANY user
    const privilegedRoles = ["super_admin", "admin", "hr", "finance"];

    const isPrivileged = privilegedRoles.includes(requesterRole);

    // Users with non-privileged roles may only fetch themselves
    if (!isPrivileged && current.uid !== requestedUid) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Fetch user from Firestore
    const snap = await adminDb.collection("users").doc(requestedUid).get();
    if (!snap.exists) {
      return new NextResponse("User not found", { status: 404 });
    }

    const data = snap.data();

    return NextResponse.json({ uid: requestedUid, ...data });
  } catch (err) {
    console.error("GET USER ERROR:", err);
    return new NextResponse("Server error", { status: 500 });
  }
}
