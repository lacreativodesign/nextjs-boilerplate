'use client';

import {
  PeriodType,
  getLast12Months,
  getLast5Years,
  getLast8Quarters,
} from '@/lib/performance/periods';

export default function PeriodSelector({
  periodType,
  period,
  onTypeChange,
  onPeriodChange,
}: {
  periodType: PeriodType;
  period: string;
  onTypeChange: (type: PeriodType) => void;
  onPeriodChange: (period: string) => void;
}) {
  const options =
    periodType === 'monthly'
      ? getLast12Months()
      : periodType === 'quarterly'
        ? getLast8Quarters()
        : getLast5Years();

  return (
    <div className="card p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      <div className="flex gap-2">
        {(['monthly', 'quarterly', 'annual'] as PeriodType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onTypeChange(type)}
            className={`btn ${periodType === type ? '' : 'ghost'}`}
          >
            {type[0].toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>
      <select
        className="input w-full sm:w-56"
        value={period}
        onChange={(e) => onPeriodChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
