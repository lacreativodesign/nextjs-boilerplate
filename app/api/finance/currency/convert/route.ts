import { NextResponse } from "next/server";
import { convertCurrency } from "@/lib/finance/exchangeRates";
import { CurrencyCode, getCurrency } from "@/lib/finance/currencies";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await checkRateLimit(req, "standard");

    const body = await req.json();
    const amountRaw = body?.amount;
    const from = String(body?.from || "").toUpperCase();
    const to = String(body?.to || "").toUpperCase();

    if (amountRaw === undefined || !from || !to) {
      throw new AppError({
        message: "Missing required fields: amount, from, to",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError({
        message: "Amount must be positive",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    getCurrency(from as CurrencyCode);
    getCurrency(to as CurrencyCode);

    const result = await convertCurrency(amount, from as CurrencyCode, to as CurrencyCode);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Currency conversion failed",
    });
    return NextResponse.json(body, { status });
  }
}
