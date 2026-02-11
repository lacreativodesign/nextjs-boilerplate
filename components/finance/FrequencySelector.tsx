"use client";

import { RecurrenceFrequency } from "@/lib/finance/recurring";

interface FrequencySelectorProps {
  frequency: RecurrenceFrequency;
  interval: number;
  dayOfMonth?: number;
  dayOfWeek?: number;
  customDays?: number;
  onFrequencyChange: (frequency: RecurrenceFrequency) => void;
  onIntervalChange: (interval: number) => void;
  onDayOfMonthChange: (day: number | undefined) => void;
  onDayOfWeekChange: (day: number | undefined) => void;
  onCustomDaysChange?: (days: number | undefined) => void;
}

export function FrequencySelector({
  frequency,
  interval,
  dayOfMonth,
  dayOfWeek,
  customDays,
  onFrequencyChange,
  onIntervalChange,
  onDayOfMonthChange,
  onDayOfWeekChange,
  onCustomDaysChange,
}: FrequencySelectorProps) {
  const showDayOfMonth = frequency === "monthly" || frequency === "quarterly" || frequency === "yearly";
  const showDayOfWeek = frequency === "weekly";
  const showCustomDays = frequency === "custom";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Frequency</label>
          <select
            value={frequency}
            onChange={(e) => onFrequencyChange(e.target.value as RecurrenceFrequency)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {frequency !== "custom" ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Every</label>
            <input
              type="number"
              min="1"
              value={interval}
              onChange={(e) => onIntervalChange(Number.parseInt(e.target.value, 10) || 1)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>
        ) : null}
      </div>

      {showDayOfMonth ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Day of Month (1-31)</label>
          <input
            type="number"
            min="1"
            max="31"
            value={dayOfMonth ?? ""}
            placeholder="Leave empty for current day"
            onChange={(e) => onDayOfMonthChange(e.target.value ? Number.parseInt(e.target.value, 10) : undefined)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
      ) : null}

      {showDayOfWeek ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Day of Week</label>
          <select
            value={dayOfWeek !== undefined ? dayOfWeek : ""}
            onChange={(e) => onDayOfWeekChange(e.target.value ? Number.parseInt(e.target.value, 10) : undefined)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="">Any day</option>
            <option value="0">Sunday</option>
            <option value="1">Monday</option>
            <option value="2">Tuesday</option>
            <option value="3">Wednesday</option>
            <option value="4">Thursday</option>
            <option value="5">Friday</option>
            <option value="6">Saturday</option>
          </select>
        </div>
      ) : null}

      {showCustomDays ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Custom Days Interval</label>
          <input
            type="number"
            min="1"
            value={customDays ?? ""}
            placeholder="e.g. every 45 days"
            onChange={(e) => onCustomDaysChange?.(e.target.value ? Number.parseInt(e.target.value, 10) : undefined)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
      ) : null}
    </div>
  );
}
