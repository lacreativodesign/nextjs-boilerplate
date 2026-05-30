import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../_utils";
import { writeAuditLog } from "@/lib/tenant/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const snap = await adminDb.collection("users").orderBy("createdAt", "desc").limit(500).get();
    const users = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        displayName: data.displayName || data.name || "",
        email: data.email || "",
        role: data.role || "",
        tenantId: data.tenantId || "",
        status: data.status || "active",
        createdAt: data.createdAt || null,
      };
    });
    return NextResponse.json({ ok: true, users });
  } catch (err) {
    const message = (err instanceof Error ? err.message : undefined) || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin(req);
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const displayName = String(body?.displayName || "").trim();
    const role = String(body?.role || "").trim();
    const tenantId = String(body?.tenantId || "").trim();
    const status = body?.status === "disabled" ? "disabled" : "active";

    if (!email || !displayName || !role || !tenantId) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const authUser = await adminAuth.createUser({ email, displayName });
    const now = admin.firestore.FieldValue.serverTimestamp();

    await adminDb.collection("users").doc(authUser.uid).set(
      {
        email,
        displayName,
        role,
        tenantId,
        status,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    await writeAuditLog({
      tenantId,
      actorUserId: user.uid,
      actionType: "user_created",
      entityType: "user",
      entityId: authUser.uid,
      metadata: { email, role, status },
    });

    return NextResponse.json({ ok: true, uid: authUser.uid });
  } catch (err) {
    const message = (err instanceof Error ? err.message : undefined) || "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
