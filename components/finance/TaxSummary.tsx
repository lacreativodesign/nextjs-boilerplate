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
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
        <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(subtotal, currency)}</span>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-400">
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
        <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(taxAmount, currency)}</span>
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
