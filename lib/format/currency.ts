import { SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/finance/currencies';

/**
 * DS-5 — one money formatter.
 *
 * Nine files defined their own, in four incompatible shapes:
 *
 *   - `Intl` with `maximumFractionDigits: 0` (admin, super_admin, TeamList, three
 *     performance pages, CustomizableDashboard) — whole dollars
 *   - `` `$${amount.toLocaleString(...)}` `` (finance reports) — separator, USD assumed
 *   - `` `$${amount.toFixed(2)}` `` (InvoiceTemplate) — no thousands separator at all
 *   - `n >= 1000 ? `$${(n/1000).toFixed(1)}k` : …` (sales and finance dashboards)
 *
 * The third shape is a real defect, not just drift: `/finance/invoices` renders the
 * amount column and all three totals as `getCurrencySymbol(currency)` followed by
 * `.toFixed(2)`, so a five-figure invoice reads `$1234.56`. Intl's grouping fixes it.
 *
 * Every entry point is null-safe. A missing amount renders `$0.00`, never `$NaN` —
 * money columns are the least forgiving place in the product to leak a bad value.
 */

export type MoneyOptions = {
  /** ISO code. Unknown codes still format; they just fall back to 2 decimals. */
  currency?: CurrencyCode | string;
  /** `auto` uses the currency's own precision (USD 2, JPY 0). A number forces it. */
  decimals?: number | 'auto';
  /** `$1.2M` instead of `$1,200,000`. Overrides `decimals`. */
  compact?: boolean;
  /** Rendered when the value is not a finite number. Defaults to a formatted zero. */
  fallback?: string;
};

const LOCALE = 'en-US';

function decimalsFor(currency: string): number {
  return SUPPORTED_CURRENCIES[currency as CurrencyCode]?.decimals ?? 2;
}

/** `1234.5` -> `$1,234.50`. `1234.5, { decimals: 0 }` -> `$1,235`. */
export function formatCurrency(
  value: number | string | null | undefined,
  options: MoneyOptions = {},
): string {
  const { currency = 'USD', decimals = 'auto', compact = false, fallback } = options;
  const amount = typeof value === 'string' ? Number(value) : value;

  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return fallback ?? formatCurrency(0, { currency, decimals, compact });
  }

  const precision = decimals === 'auto' ? decimalsFor(currency) : Math.max(0, decimals);

  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      ...(compact
        ? { notation: 'compact', maximumFractionDigits: 1 }
        : { minimumFractionDigits: precision, maximumFractionDigits: precision }),
    }).format(amount);
  } catch {
    // Intl throws on a malformed currency code. A readable string beats a crash in a
    // table cell, so fall back to the code as a prefix.
    return `${currency} ${amount.toFixed(precision)}`;
  }
}

/** `1_234_567` -> `$1.2M`. For KPI tiles and chart axes. */
export function formatCompactCurrency(
  value: number | string | null | undefined,
  currency: CurrencyCode | string = 'USD',
): string {
  return formatCurrency(value, { currency, compact: true });
}

/** Whole units, no cents. For dashboards where the decimals are noise. */
export function formatWholeCurrency(
  value: number | string | null | undefined,
  currency: CurrencyCode | string = 'USD',
): string {
  return formatCurrency(value, { currency, decimals: 0 });
}

/** Grouped number with no currency symbol — counts, quantities, row totals. */
export function formatNumber(value: number | string | null | undefined, decimals = 0): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return formatNumber(0, decimals);
  }
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
