"use client";

import { useEffect, useState } from "react";

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  type: string;
  country: string;
  region?: string;
}

interface TaxRateSelectorProps {
  value: string | null;
  onChange: (taxRateId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

export function TaxRateSelector({ value, onChange, disabled, className }: TaxRateSelectorProps) {
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTaxRates = async () => {
      try {
        const response = await fetch("/api/finance/tax-rates/list?active=true", {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as { ok?: boolean; taxRates?: TaxRate[] };
        if (data.ok && Array.isArray(data.taxRates)) {
          setTaxRates(data.taxRates);
        }
      } catch (error) {
        console.error("Failed to fetch tax rates:", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchTaxRates();
  }, []);

  return (
    <div className={className}>
      <label htmlFor="tax-rate" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Tax Rate
      </label>
      <select
        id="tax-rate"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled || loading}
        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
        <option value="">No Tax</option>
        {taxRates.map((rate) => (
          <option key={rate.id} value={rate.id}>
            {rate.name} ({rate.rate}%) - {rate.country}
            {rate.region ? ` / ${rate.region}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
