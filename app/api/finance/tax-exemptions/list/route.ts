import { NextResponse } from "next/server";
import { requireFinance } from "@/app/api/finance/_utils";
import { resolveErrorResponse } from "@/lib/errors";
import { adminDb } from "@/lib/firebaseAdmin";
import { logError } from "@/lib/logging";
import { checkRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, "standard", auth.user.uid);

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");

    let query: FirebaseFirestore.Query = adminDb
      .collection("tax_exemptions")
      .where("tenantId", "==", auth.user.tenantId);

    if (clientId) {
      query = query.where("clientId", "==", clientId);
    }

    const snapshot = await query.get();
    const exemptions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ ok: true, exemptions });
  } catch (err) {
    logError(err, { route: "GET /api/finance/tax-exemptions/list" });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Failed to fetch tax exemptions",
    });
    return NextResponse.json(body, { status });
  }
}
