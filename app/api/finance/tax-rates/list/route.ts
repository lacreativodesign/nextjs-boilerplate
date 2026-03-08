import { NextResponse } from "next/server";
import { requireFinance } from "@/app/api/finance/_utils";
import { resolveErrorResponse } from "@/lib/errors";
import { adminDb } from "@/lib/firebaseAdmin";
import { logError } from "@/lib/logging";
import { checkRateLimit } from "@/lib/security";
import { withApiCache } from "@/lib/cache/middleware";
import { CacheProfiles } from "@/lib/cache/middleware";
import { cacheKeys } from "@/lib/cache/redis-client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    return withApiCache(req, async () => {
      await checkRateLimit(req, "standard", auth.user.uid);

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "true";
    const country = searchParams.get("country")?.toUpperCase();

    let query: FirebaseFirestore.Query = adminDb
      .collection("tax_rates")
      .where("tenantId", "==", auth.user.tenantId);

    if (activeOnly) {
      query = query.where("isActive", "==", true);
    }

    if (country) {
      query = query.where("country", "==", country);
    }

    const snapshot = await query.get();

    const taxRates = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

      return NextResponse.json({ ok: true, taxRates });
    }, {
      ttlSeconds: CacheProfiles.taxRates,
      key: async (request) => {
        const { searchParams } = new URL(request.url);
        return cacheKeys.taxRates(auth.user.tenantId, {
          active: searchParams.get("active") || "",
          country: searchParams.get("country") || "",
        });
      },
      tags: [`tenant:${auth.user.tenantId}:tax-rates`],
    });
  } catch (err) {
    logError(err, { route: "GET /api/finance/tax-rates/list" });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Failed to fetch tax rates",
    });
    return NextResponse.json(body, { status });
  }
}
