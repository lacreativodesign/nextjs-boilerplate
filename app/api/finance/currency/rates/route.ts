import { NextResponse } from "next/server";
import { getExchangeRates } from "@/lib/finance/exchangeRates";
import { CurrencyCode, getCurrency } from "@/lib/finance/currencies";
import { resolveErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await checkRateLimit(req, "standard");

    const { searchParams } = new URL(req.url);
    const base = (searchParams.get("base") || "USD").toUpperCase() as CurrencyCode;
    getCurrency(base);

    const rates = await getExchangeRates(base);

    return NextResponse.json({
      ok: true,
      base,
      rates,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Failed to fetch exchange rates",
    });
    return NextResponse.json(body, { status });
  }
}
