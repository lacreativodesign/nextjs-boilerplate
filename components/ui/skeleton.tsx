import React from "react";

const baseStyles =
  "animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-800/80 transition-opacity duration-300";

type SkeletonVariant = "text" | "card" | "block" | "avatar";

type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  variant?: SkeletonVariant;
  className?: string;
};

const sizeValue = (value?: string | number) =>
  typeof value === "number" ? `${value}px` : value;

export function Skeleton({ width, height, variant = "block", className = "" }: SkeletonProps) {
  const styles: React.CSSProperties = {
    width: sizeValue(width),
    height: sizeValue(height),
  };

  const variantClasses =
    variant === "text"
      ? "h-4 w-full"
      : variant === "card"
      ? "h-32 w-full"
      : variant === "avatar"
      ? "h-12 w-12 rounded-full"
      : "";

  return <div className={`${baseStyles} ${variantClasses} ${className}`} style={styles} />;
}

export function SkeletonCard({ width, height, className = "" }: SkeletonProps) {
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

type SkeletonTableProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

export function SkeletonTable({ rows = 6, columns = 5, className = "" }: SkeletonTableProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, idx) => (
          <Skeleton key={`header-${idx}`} variant="text" className="h-4 w-full" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={`row-${row}`} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((__, col) => (
              <Skeleton key={`cell-${row}-${col}`} variant="text" className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

type SkeletonFormProps = {
  fields?: number;
  className?: string;
};

export function SkeletonForm({ fields = 5, className = "" }: SkeletonFormProps) {
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

type SkeletonChartProps = {
  height?: number;
  className?: string;
};

export function SkeletonChart({ height = 220, className = "" }: SkeletonChartProps) {
  return <Skeleton variant="block" className={`w-full rounded-xl ${className}`} height={height} />;
}
