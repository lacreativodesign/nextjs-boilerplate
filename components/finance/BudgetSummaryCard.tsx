"use client";

import React from "react";
import { CurrencyCode, formatCurrency } from "@/lib/finance/currencies";

interface BudgetSummaryCardProps {
  name: string;
  totalAmount: number;
  spentAmount: number;
  currency: CurrencyCode;
  period: string;
  status: string;
  onClick?: () => void;
}

export function BudgetSummaryCard({
  name,
  totalAmount,
  spentAmount,
  currency,
  period,
  status,
  onClick,
}: BudgetSummaryCardProps) {
  const remainingAmount = totalAmount - spentAmount;
  const utilizationPercentage = totalAmount > 0 ? (spentAmount / totalAmount) * 100 : 0;

  const statusColors = {
    draft: "bg-[var(--surface-muted)] text-[var(--text-muted)]",
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    closed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    revised: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  };

  const utilizationColor =
    utilizationPercentage > 90 ? "bg-red-500" : utilizationPercentage > 75 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div
      onClick={onClick}
      className="card cursor-pointer transition-all hover:shadow-[var(--shadow-lift)] hover:-translate-y-0.5"
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{name}</h3>
          <p className="text-sm capitalize text-[var(--text-muted)]">{period}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            statusColors[status as keyof typeof statusColors] || statusColors.draft
          }`}
        >
          {status}
        </span>
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--text-muted)]">Allocated</span>
          <span className="font-medium text-[var(--text-primary)]">{formatCurrency(totalAmount, currency)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--text-muted)]">Spent</span>
          <span className="font-medium text-[var(--text-primary)]">{formatCurrency(spentAmount, currency)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--text-muted)]">Remaining</span>
          <span className="font-medium text-[var(--text-primary)]">{formatCurrency(remainingAmount, currency)}</span>
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-[var(--text-muted)]">Utilization</span>
          <span className="font-medium text-[var(--text-primary)]">{utilizationPercentage.toFixed(1)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div
            className={`h-full ${utilizationColor} transition-all duration-300`}
            style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
