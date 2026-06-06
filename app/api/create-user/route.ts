import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";

export async function POST(req: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // tenantId comes from the authenticated session
  const tenantId = auth.user.tenantId as string;
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant not found in session" }, { status: 403 });
  }

  try {
    const { email, password, role, name } = await req.json();

    if (!email || !password || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name || "",
    });

    // 2. Set custom claims — role AND tenantId required for Firestore rules and middleware
    await adminAuth.setCustomUserClaims(userRecord.uid, { role, tenantId });

    // 3. Store user document in Firestore with tenantId
    await adminDb.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      name: name || "",
      role,
      tenantId,
      status: "active",
      createdAt: Date.now(),
    });

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (err: any) {
    console.error("Create user failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
