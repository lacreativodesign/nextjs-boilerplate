import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireHrAccess, toIso } from "../../_utils";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const snap = await adminDb.collection("users").limit(500).get();
    const users = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        ...data,
        createdAt: toIso(data?.createdAt),
        updatedAt: toIso(data?.updatedAt),
      };
    });

    return NextResponse.json({
      ok: true,
      users,
      currentUser: {
        uid: access.user.uid,
        role: access.user.role,
        name: access.user.name || null,
        email: access.user.email || null,
      },
    });
  } catch (err) {
    console.error("HR employees list error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
