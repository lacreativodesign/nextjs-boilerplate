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
    draft: "bg-gray-100 text-gray-800",
    active: "bg-green-100 text-green-800",
    closed: "bg-red-100 text-red-800",
    revised: "bg-yellow-100 text-yellow-800",
  };

  const utilizationColor =
    utilizationPercentage > 90 ? "bg-red-500" : utilizationPercentage > 75 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{name}</h3>
          <p className="text-sm capitalize text-gray-500 dark:text-gray-400">{period}</p>
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
          <span className="text-gray-600 dark:text-gray-400">Allocated</span>
          <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(totalAmount, currency)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Spent</span>
          <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(spentAmount, currency)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Remaining</span>
          <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(remainingAmount, currency)}</span>
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Utilization</span>
          <span className="font-medium text-gray-900 dark:text-white">{utilizationPercentage.toFixed(1)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={`h-full ${utilizationColor} transition-all duration-300`}
            style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
