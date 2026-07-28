'use client';

type Unit = 'USD' | 'count' | '%';

type ProgressBarProps = {
  label: string;
  actual: number;
  target: number;
  unit: Unit;
  periodLabel?: string;
  size?: 'sm' | 'md' | 'lg';
};

const heights = { sm: 'h-[6px]', md: 'h-[10px]', lg: 'h-[14px]' };

function formatValue(value: number, unit: Unit) {
  if (unit === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (unit === '%') return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

function getFillColor(percentage: number) {
  if (percentage >= 100) return 'var(--color-green)';
  if (percentage >= 80) return 'var(--erp-blue)';
  if (percentage >= 50) return 'var(--warning-strong)';
  return 'var(--danger-strong)';
}

export default function ProgressBar({
  label,
  actual,
  target,
  unit,
  periodLabel,
  size = 'md',
}: ProgressBarProps) {
  if (target <= 0) {
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-[var(--text-muted)]">
          <span>{label}</span>
          {periodLabel ? <span>{periodLabel}</span> : null}
        </div>
        <p className="text-xs text-[var(--text-muted)]">No target set</p>
      </div>
    );
  }

  const percentage = Math.round((actual / target) * 100);
  const visual = Math.min(percentage, 100);
  const color = getFillColor(percentage);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-xs">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="text-[var(--text-primary)] font-medium">
          {formatValue(actual, unit)} / {formatValue(target, unit)} {unit}
        </span>
      </div>
      <div
        className={`w-full rounded-full bg-[var(--surface-neutral)] overflow-hidden ${heights[size]}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-in-out"
          style={{ width: `${visual}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-end text-xs text-[var(--text-muted)]">
        {percentage}%{percentage > 100 ? ' ✓' : ''}
      </div>
    </div>
  );
}
