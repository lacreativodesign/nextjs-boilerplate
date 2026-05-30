"use client";

import React from "react";
import { type CurrencyCode, formatCurrency } from "@/lib/finance/currencies";

interface VarianceDisplayProps {
  allocated: number;
  actual: number;
  currency: CurrencyCode;
  showPercentage?: boolean;
}

export function VarianceDisplay({ allocated, actual, currency, showPercentage = true }: VarianceDisplayProps) {
  const variance = allocated - actual;
  const variancePercentage = allocated > 0 ? (variance / allocated) * 100 : 0;

  const isOver = variance < 0;
  const isOnTrack = Math.abs(variancePercentage) <= 5;

  const statusColor = isOnTrack
    ? "text-blue-600 dark:text-blue-400"
    : isOver
      ? "text-red-600 dark:text-red-400"
      : "text-green-600 dark:text-green-400";

  const statusIcon = isOnTrack ? "≈" : isOver ? "↑" : "↓";
  const statusText = isOnTrack ? "On Track" : isOver ? "Over Budget" : "Under Budget";

  return (
    <div className="flex items-center gap-2">
      <span className={`text-2xl ${statusColor}`}>{statusIcon}</span>
      <div>
        <div className={`text-sm font-medium ${statusColor}`}>{formatCurrency(Math.abs(variance), currency)}</div>
        {showPercentage ? (
          <div className="text-xs text-[var(--text-muted)]">
            {Math.abs(variancePercentage).toFixed(1)}% {statusText}
          </div>
        ) : null}
      </div>
    </div>
  );
}
