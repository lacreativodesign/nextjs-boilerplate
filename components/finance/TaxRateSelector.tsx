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
      <label htmlFor="tax-rate" className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
        Tax Rate
      </label>
      <select
        id="tax-rate"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled || loading}
        className="input"
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
