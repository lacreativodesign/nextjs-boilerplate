'use client';

import React from 'react';
import { CurrencyCode, getAllCurrencies } from '@/lib/finance/currencies';

interface CurrencySelectorProps {
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
  disabled?: boolean;
  className?: string;
}

export function CurrencySelector({ value, onChange, disabled, className }: CurrencySelectorProps) {
  const currencies = getAllCurrencies();

  return (
    <div className={className}>
      <label
        htmlFor="currency"
        className="mb-1 block text-sm font-medium text-[var(--text-primary)]"
      >
        Currency
      </label>
      <select
        id="currency"
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyCode)}
        disabled={disabled}
        className="input"
      >
        {currencies.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.code} - {currency.symbol} {currency.name}
          </option>
        ))}
      </select>
    </div>
  );
}
