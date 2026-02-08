import React from "react";

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
  lines?: number;
  showAvatar?: boolean;
  className?: string;
};

type SkeletonTableProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

type SkeletonDashboardProps = {
  className?: string;
};

export function SkeletonLine({ width = "100%", height = "16px", className = "" }: SkeletonLineProps) {
  return <div className={`skeleton-shimmer animate-pulse rounded ${className}`} style={{ width, height }} />;
}

export function SkeletonCircle({ size = 40, className = "" }: SkeletonCircleProps) {
  return <div className={`skeleton-shimmer animate-pulse rounded-full ${className}`} style={{ width: size, height: size }} />;
}

export function SkeletonCard({ lines = 3, showAvatar = false, className = "" }: SkeletonCardProps) {
  return (
    <div className={`card ${className}`} style={{ padding: 16 }}>
      <div className="flex items-start gap-3">
        {showAvatar ? <SkeletonCircle size={40} /> : null}
        <div className="flex-1 space-y-2">
          {Array.from({ length: lines }).map((_, idx) => (
            <SkeletonLine key={idx} width={idx === lines - 1 ? "80%" : "100%"} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4, className = "" }: SkeletonTableProps) {
  return (
    <div className={`card ${className}`} style={{ padding: 16 }}>
      <div className="space-y-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
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

export function SkeletonDashboard({ className = "" }: SkeletonDashboardProps) {
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
