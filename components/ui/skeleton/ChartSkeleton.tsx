import { Skeleton } from '@/components/ui/Skeleton';

type ChartSkeletonProps = {
  height?: number;
  className?: string;
};

export default function ChartSkeleton({ height = 240, className = '' }: ChartSkeletonProps) {
  return (
    <div className={`space-y-3 ${className}`.trim()} aria-hidden="true">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="w-full rounded-xl" height={height} />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={`legend-${index}`} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}
