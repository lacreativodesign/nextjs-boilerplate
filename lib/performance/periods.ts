export type PeriodType = 'monthly' | 'quarterly' | 'annual';

function padMonth(monthIndex: number): string {
  return String(monthIndex + 1).padStart(2, '0');
}

export function getCurrentPeriod(type: PeriodType): string {
  const now = new Date();
  const year = now.getFullYear();
  if (type === 'annual') return String(year);
  if (type === 'quarterly') return `${year}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  return `${year}-${padMonth(now.getMonth())}`;
}

export function getPeriodLabel(period: string, type: PeriodType): string {
  if (type === 'annual') return period;
  if (type === 'quarterly') {
    const [year, quarter] = period.split('-');
    return `${quarter} ${year}`;
  }

  const [year, monthRaw] = period.split('-');
  const month = Number(monthRaw) - 1;
  if (Number.isNaN(month) || month < 0 || month > 11) return period;
  const date = new Date(Number(year), month, 1);
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
}

export function getPeriodDateRange(period: string, type: PeriodType): { start: Date; end: Date } {
  if (type === 'annual') {
    const year = Number(period);
    return {
      start: new Date(year, 0, 1, 0, 0, 0, 0),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
    };
  }

  if (type === 'quarterly') {
    const [yearRaw, quarterRaw] = period.split('-');
    const year = Number(yearRaw);
    const quarter = Number((quarterRaw || 'Q1').replace('Q', ''));
    const startMonth = (quarter - 1) * 3;
    return {
      start: new Date(year, startMonth, 1, 0, 0, 0, 0),
      end: new Date(year, startMonth + 3, 0, 23, 59, 59, 999),
    };
  }

  const [yearRaw, monthRaw] = period.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw) - 1;
  return {
    start: new Date(year, month, 1, 0, 0, 0, 0),
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
  };
}

export function getLast12Months(): Array<{ value: string; label: string }> {
  const now = new Date();
  return Array.from({ length: 12 }).map((_, idx) => {
    const date = new Date(now.getFullYear(), now.getMonth() - idx, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: getPeriodLabel(value, 'monthly') };
  });
}

export function getLast8Quarters(): Array<{ value: string; label: string }> {
  const now = new Date();
  const absoluteQuarter = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
  return Array.from({ length: 8 }).map((_, idx) => {
    const qIndex = absoluteQuarter - idx;
    const year = Math.floor(qIndex / 4);
    const quarter = (qIndex % 4) + 1;
    const value = `${year}-Q${quarter}`;
    return { value, label: getPeriodLabel(value, 'quarterly') };
  });
}

export function getLast5Years(): Array<{ value: string; label: string }> {
  const year = new Date().getFullYear();
  return Array.from({ length: 5 }).map((_, idx) => {
    const value = String(year - idx);
    return { value, label: value };
  });
}
