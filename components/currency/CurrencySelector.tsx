'use client';

import { SUPPORTED_CURRENCIES } from '@/lib/currency/currencyConverter';

interface CurrencySelectorProps {
  value: string;
  onChange: (currency: string) => void;
  className?: string;
}

export function CurrencySelector({ value, onChange, className = '' }: CurrencySelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`border rounded p-2 ${className}`}
    >
      {SUPPORTED_CURRENCIES.map((currency) => (
        <option key={currency.code} value={currency.code}>
          {currency.symbol} {currency.code} - {currency.name}
        </option>
      ))}
    </select>
  );
}
