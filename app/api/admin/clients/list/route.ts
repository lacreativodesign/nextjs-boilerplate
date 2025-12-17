import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "@/lib/getCurrentUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await getCurrentUser();

    // Keep the same “admin-only” approach as other admin APIs
    if (!me || !["admin", "super_admin"].includes(String(me.role || "").toLowerCase())) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // If the collection doesn't exist yet, Firestore returns empty docs array (no crash)
    const snap = await adminDb.collection("clients").orderBy("createdAt", "desc").limit(500).get();

    const clients = snap.docs.map((d) => {
      const data = d.data() || {};

      // Normalize numbers safely
      const totalPaidUsd =
        typeof data.totalPaidUsd === "number"
          ? data.totalPaidUsd
          : Number(data.totalPaidUsd || 0);

      return {
        id: d.id,
        ...data,
        totalPaidUsd,
        createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt || null,
        lastActivityAt: data.lastActivityAt?.toDate?.()
          ? data.lastActivityAt.toDate().toISOString()
          : data.lastActivityAt || null,
      };
    });

    return NextResponse.json({ ok: true, clients });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load clients" },
      { status: 500 }
    );
  }
}
