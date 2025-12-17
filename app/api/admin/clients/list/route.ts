import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "@/app/api/admin/_utils";

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me || !isAdminRole(me.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Firestore: clients collection
    const snap = await adminDb.collection("clients").orderBy("createdAt", "desc").get();

    const clients = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        ...data,
      };
    });

    return NextResponse.json({ ok: true, clients });
  } catch (err: any) {
    console.error("clients/list error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
