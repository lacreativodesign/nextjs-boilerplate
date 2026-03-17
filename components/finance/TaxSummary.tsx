"use client";

import { CurrencyCode, formatCurrency } from "@/lib/finance/currencies";

interface TaxSummaryProps {
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: CurrencyCode;
  taxRateName?: string;
  taxRate?: number;
  taxExempt?: boolean;
}

export function TaxSummary({
  subtotal,
  taxAmount,
  total,
  currency,
  taxRateName,
  taxRate,
  taxExempt,
}: TaxSummaryProps) {
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
      <div className="flex justify-between text-sm">
        <span className="text-[var(--text-muted)]">Subtotal</span>
        <span className="font-medium text-[var(--text-primary)]">{formatCurrency(subtotal, currency)}</span>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-[var(--text-muted)]">
          {taxExempt ? (
            <>
              Tax <span className="ml-1 text-xs text-green-600">(Exempt)</span>
            </>
          ) : (
            <>
              {taxRateName || "Tax"}
              {taxRate !== undefined ? ` (${taxRate}%)` : ""}
            </>
          )}
        </span>
        <span className="font-medium text-[var(--text-primary)]">{formatCurrency(taxAmount, currency)}</span>
      </div>

      <div className="border-t border-gray-200 pt-2 dark:border-gray-700">
        <div className="flex justify-between">
          <span className="text-base font-semibold text-gray-900 dark:text-white">Total</span>
          <span className="text-base font-semibold text-gray-900 dark:text-white">{formatCurrency(total, currency)}</span>
        </div>
      </div>
    </div>
  );
}
