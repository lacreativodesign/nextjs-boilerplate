import { adminDb } from "@/lib/firebaseAdmin";
import { AppError } from "@/lib/errors";
import { CurrencyCode, getCurrency } from "./currencies";

const CACHE_DURATION_HOURS = 1;
const API_BASE_URL = process.env.EXCHANGE_RATE_API_URL || "https://v6.exchangerate-api.com/v6";
const API_KEY = process.env.EXCHANGE_RATE_API_KEY;

interface ExchangeRateResponse {
  result: "success" | "error";
  base_code: string;
  conversion_rates: Record<string, number>;
  time_last_update_unix: number;
}

async function fetchExchangeRatesFromAPI(baseCurrency: CurrencyCode = "USD"): Promise<Record<string, number>> {
  if (!API_KEY) {
    throw new AppError({
      message: "Exchange rate API key not configured",
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
    });
  }

  const url = `${API_BASE_URL}/${API_KEY}/latest/${baseCurrency}`;

  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data: ExchangeRateResponse = await response.json();

    if (data.result !== "success") {
      throw new Error("API returned error result");
    }

    return data.conversion_rates;
  } catch (error) {
    console.error("Failed to fetch exchange rates from API:", error);
    throw new AppError({
      message: "Failed to fetch exchange rates",
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
    });
  }
}

export async function getExchangeRates(baseCurrency: CurrencyCode = "USD"): Promise<Record<string, number>> {
  const cacheKey = `exchange_rates_${baseCurrency}`;

  try {
    const cacheDoc = await adminDb.collection("system").doc(cacheKey).get();

    if (cacheDoc.exists) {
      const cacheData = cacheDoc.data();
      const cacheAge = Date.now() - Number(cacheData?.timestamp || 0);
      const cacheMaxAge = CACHE_DURATION_HOURS * 60 * 60 * 1000;

      if (cacheAge < cacheMaxAge && cacheData?.rates) {
        return cacheData.rates as Record<string, number>;
      }
    }

    const rates = await fetchExchangeRatesFromAPI(baseCurrency);

    await adminDb.collection("system").doc(cacheKey).set({
      rates,
      baseCurrency,
      timestamp: Date.now(),
      updatedAt: new Date(),
    });

    return rates;
  } catch (error) {
    console.error("Error getting exchange rates:", error);

    const cacheDoc = await adminDb.collection("system").doc(cacheKey).get();
    if (cacheDoc.exists) {
      return (cacheDoc.data()?.rates || {}) as Record<string, number>;
    }

    throw error;
  }
}

export async function getExchangeRate(from: CurrencyCode, to: CurrencyCode): Promise<number> {
  if (from === to) {
    return 1;
  }

  getCurrency(from);
  getCurrency(to);

  const rates = await getExchangeRates(from);
  const rate = rates[to];

  if (!rate) {
    throw new AppError({
      message: `Exchange rate not available for ${from} to ${to}`,
      code: "NOT_FOUND",
      status: 404,
    });
  }

  return rate;
}

export async function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): Promise<{ amount: number; rate: number; convertedAmount: number }> {
  const rate = await getExchangeRate(from, to);
  const convertedAmount = amount * rate;
  const toCurrency = getCurrency(to);
  const multiplier = 10 ** toCurrency.decimals;

  return {
    amount,
    rate,
    convertedAmount: Math.round(convertedAmount * multiplier) / multiplier,
  };
}

export async function storeHistoricalRate(
  from: CurrencyCode,
  to: CurrencyCode,
  rate: number,
  tenantId: string
): Promise<void> {
  await adminDb.collection("exchange_rate_history").add({
    from,
    to,
    rate,
    tenantId,
    timestamp: new Date(),
    createdAt: new Date(),
  });
}
