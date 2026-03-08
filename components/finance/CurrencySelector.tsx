"use client";

import React from "react";
import { CurrencyCode, getAllCurrencies } from "@/lib/finance/currencies";

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
      <label htmlFor="currency" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Currency
      </label>
      <select
        id="currency"
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyCode)}
        disabled={disabled}
        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
