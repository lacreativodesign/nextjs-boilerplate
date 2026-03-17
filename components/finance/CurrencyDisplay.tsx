"use client";

import React from "react";
import { CurrencyCode, formatCurrency } from "@/lib/finance/currencies";

interface CurrencyDisplayProps {
  amount: number;
  currency: CurrencyCode;
  className?: string;
  showCode?: boolean;
}

export function CurrencyDisplay({ amount, currency, className, showCode = false }: CurrencyDisplayProps) {
  const formatted = formatCurrency(amount, currency);

  return (
    <span className={className}>
      {formatted}
      {showCode && <span className="ml-1 text-xs text-[var(--text-muted)]">{currency}</span>}
    </span>
  );
}
