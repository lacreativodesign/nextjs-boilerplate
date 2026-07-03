import React from 'react';

const baseStyles =
  'animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-800/80 transition-opacity duration-300';

type SkeletonVariant = 'text' | 'card' | 'block' | 'avatar';

type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  variant?: SkeletonVariant;
  className?: string;
};

type SkeletonLineProps = {
  width?: string;
  height?: string;
  className?: string;
};

type SkeletonCircleProps = {
  size?: number;
  className?: string;
};

type SkeletonCardProps = {
  width?: string | number;
  height?: string | number;
  lines?: number;
  showAvatar?: boolean;
  className?: string;
};

type SkeletonTableProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

type SkeletonFormProps = {
  fields?: number;
  className?: string;
};

type SkeletonChartProps = {
  height?: number;
  className?: string;
};

type SkeletonDashboardProps = {
  className?: string;
};

const sizeValue = (value?: string | number) => (typeof value === 'number' ? `${value}px` : value);

export function Skeleton({ width, height, variant = 'block', className = '' }: SkeletonProps) {
  const styles: React.CSSProperties = {
    width: sizeValue(width),
    height: sizeValue(height),
  };

  const variantClasses =
    variant === 'text'
      ? 'h-4 w-full'
      : variant === 'card'
        ? 'h-32 w-full'
        : variant === 'avatar'
          ? 'h-12 w-12 rounded-full'
          : '';

  return <div className={`${baseStyles} ${variantClasses} ${className}`} style={styles} />;
}

export function SkeletonLine({
  width = '100%',
  height = '16px',
  className = '',
}: SkeletonLineProps) {
  return (
    <div
      className={`skeleton-shimmer animate-pulse rounded ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonCircle({ size = 40, className = '' }: SkeletonCircleProps) {
  return (
    <div
      className={`skeleton-shimmer animate-pulse rounded-full ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonCard({
  width,
  height,
  lines = 3,
  showAvatar = false,
  className = '',
}: SkeletonCardProps) {
  if (lines || showAvatar) {
    return (
      <div
        className={`card ${className}`}
        style={{ padding: 16, width: sizeValue(width), height: sizeValue(height) }}
      >
        <div className="flex items-start gap-3">
          {showAvatar ? <SkeletonCircle size={40} /> : null}
          <div className="flex-1 space-y-2">
            {Array.from({ length: lines }).map((_, idx) => (
              <SkeletonLine key={idx} width={idx === lines - 1 ? '80%' : '100%'} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 ${className}`}
      style={{ width: sizeValue(width), height: sizeValue(height) }}
    >
      <Skeleton variant="text" className="h-4 w-2/5" />
      <Skeleton variant="text" className="mt-4 h-6 w-3/5" />
      <Skeleton variant="text" className="mt-3 h-4 w-1/3" />
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 5, className = '' }: SkeletonTableProps) {
  return (
    <div className={`card ${className}`} style={{ padding: 16 }}>
      <div className="space-y-3">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, idx) => (
            <SkeletonLine key={`header-${idx}`} height="14px" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={`row-${rowIdx}`}
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, colIdx) => (
              <SkeletonLine key={`cell-${rowIdx}-${colIdx}`} height="12px" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonForm({ fields = 5, className = '' }: SkeletonFormProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: fields }).map((_, idx) => (
        <div key={`field-${idx}`} className="space-y-2">
          <Skeleton variant="text" className="h-3 w-1/4" />
          <Skeleton variant="block" className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 220, className = '' }: SkeletonChartProps) {
  return <Skeleton variant="block" className={`w-full rounded-xl ${className}`} height={height} />;
}

export function SkeletonDashboard({ className = '' }: SkeletonDashboardProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <SkeletonCard key={`kpi-${idx}`} lines={2} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2" style={{ padding: 16 }}>
          <SkeletonLine width="40%" height="18px" className="mb-4" />
          <div className="space-y-3">
            <SkeletonLine height="180px" className="rounded-2xl" />
            <div className="grid grid-cols-3 gap-3">
              <SkeletonLine height="12px" />
              <SkeletonLine height="12px" />
              <SkeletonLine height="12px" />
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <SkeletonLine width="60%" height="18px" className="mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonLine key={`activity-${idx}`} height="14px" />
            ))}
          </div>
        </div>
      </div>
      <SkeletonCard lines={4} />
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} className="h-12 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: items }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
