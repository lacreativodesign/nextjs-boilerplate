import { Skeleton } from "@/components/ui/Skeleton";

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  rowHeightClassName?: string;
  className?: string;
};

export default function TableSkeleton({
  rows = 6,
  columns = 6,
  showHeader = true,
  rowHeightClassName = "h-10",
  className = "",
}: TableSkeletonProps) {
  return (
    <div className={`w-full space-y-3 ${className}`.trim()} aria-hidden="true">
      {showHeader ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={`table-head-${index}`} className="h-4 w-full" />
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={`table-row-${rowIndex}`}
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton key={`table-cell-${rowIndex}-${colIndex}`} className={`${rowHeightClassName} w-full`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
