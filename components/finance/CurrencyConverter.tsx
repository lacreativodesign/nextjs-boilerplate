"use client";

import React, { useEffect, useState } from "react";
import { CurrencySelector } from "./CurrencySelector";
import type { CurrencyCode } from "@/lib/finance/currencies";
import { CurrencyDisplay } from "./CurrencyDisplay";

export function CurrencyConverter() {
  const [amount, setAmount] = useState<number>(100);
  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>("USD");
  const [toCurrency, setToCurrency] = useState<CurrencyCode>("EUR");
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const executeConversion = async () => {
      if (amount <= 0) return;

      setLoading(true);
      try {
        const response = await fetch("/api/finance/currency/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, from: fromCurrency, to: toCurrency }),
        });

        const data = await response.json();

        if (data.ok) {
          setConvertedAmount(data.convertedAmount);
          setExchangeRate(data.rate);
        }
      } catch (error) {
        console.error("Conversion error:", error);
      } finally {
        setLoading(false);
      }
    };

    executeConversion();
  }, [amount, fromCurrency, toCurrency]);

  return (
    <div className="card p-6">
      <h3 className="mb-4 section-title">Currency Converter</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            className="input"
            min="0"
            step="0.01"
          />
        </div>

        <CurrencySelector value={fromCurrency} onChange={setFromCurrency} />
      </div>

      <div className="my-4 flex items-center justify-center">
        <button
          onClick={() => {
            setFromCurrency(toCurrency);
            setToCurrency(fromCurrency);
          }}
          className="rounded-full bg-blue-100 p-2 text-blue-600 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300"
        >
          ⇅
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">Converted Amount</label>
          <div className="block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700">
            {loading ? (
              <span className="text-gray-400">Converting...</span>
            ) : convertedAmount !== null ? (
              <CurrencyDisplay amount={convertedAmount} currency={toCurrency} />
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </div>
        </div>

        <CurrencySelector value={toCurrency} onChange={setToCurrency} />
      </div>

      {exchangeRate && (
        <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-300">
          1 {fromCurrency} = {exchangeRate.toFixed(4)} {toCurrency}
        </div>
      )}
    </div>
  );
}
