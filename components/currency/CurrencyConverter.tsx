"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { CurrencySelector } from "@/components/currency/CurrencySelector";

export function CurrencyConverter() {
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("EUR");
  const [amount, setAmount] = useState(100);
  const [result, setResult] = useState(0);
  const [rate, setRate] = useState(0);

  useEffect(() => {
    const run = async () => {
      const res = await fetch(`/api/currency/rates?from=${from}&to=${to}`, { cache: "no-store" });
      const data = await res.json();
      const nextRate = Number(data?.rate || 0);
      setRate(nextRate);
      setResult(Number((amount * nextRate).toFixed(2)));
    };

    void run();
  }, [from, to, amount]);

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4">Currency Converter</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm">From</label>
          <CurrencySelector value={from} onChange={setFrom} className="w-full" />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className="mt-2 border rounded p-2 w-full"
          />
        </div>
        <div>
          <label className="text-sm">To</label>
          <CurrencySelector value={to} onChange={setTo} className="w-full" />
          <input
            type="number"
            value={Number.isFinite(result) ? result.toFixed(2) : "0.00"}
            disabled
            className="mt-2 border rounded p-2 w-full bg-gray-50"
          />
        </div>
      </div>
      <p className="text-sm text-gray-500 mt-2">1 {from} = {rate.toFixed(6)} {to}</p>
    </Card>
  );
}
