import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getDirectReports } from "@/lib/team";
import { requireAmManagerOrAdmin } from "../../admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAmManagerOrAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant context missing." }, { status: 403 });
    }

    const team = await getDirectReports({
      tenantId: auth.user.tenantId,
      managerUid: auth.user.uid,
      reportRole: "am",
    });
    const amUids = new Set(team.map((m) => m.uid));

    if (amUids.size === 0) {
      return NextResponse.json({ ok: true, clients: [] });
    }

    const snap = await adminDb
      .collection("clients")
      .where("tenantId", "==", auth.user.tenantId)
      .limit(500)
      .get();

    const clients = snap.docs
      .map((doc) => {
        const data = (doc.data() || {}) as {
          ownerAmUid?: string | null;
          ownerId?: string | null;
          amId?: string | null;
          createdByUid?: string | null;
          name?: string;
          companyName?: string;
          clientName?: string;
          email?: string;
        };

        // Mirror isOwnedByAm field checks (ownerAmUid/ownerId/amId), plus
        // createdByUid, and capture which AM in the manager's team owns it.
        const owner = [data.ownerAmUid, data.ownerId, data.amId, data.createdByUid].find(
          (uid): uid is string => Boolean(uid) && amUids.has(uid as string),
        );

        if (!owner) {
          return null;
        }

        return {
          id: doc.id,
          name: data.name || data.companyName || data.clientName || "",
          email: data.email || "",
          owner,
        };
      })
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    return NextResponse.json({ ok: true, clients });
  } catch (err: any) {
    console.error("am manager clients error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load clients." }, { status: 500 });
  }
}
