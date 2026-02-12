import { Skeleton } from "@/components/ui/Skeleton";
import ChartSkeleton from "@/components/ui/skeleton/ChartSkeleton";

type DashboardSkeletonProps = {
  statCards?: number;
  className?: string;
};

export default function DashboardSkeleton({ statCards = 4, className = "" }: DashboardSkeletonProps) {
  return (
    <div className={`space-y-6 ${className}`.trim()} aria-hidden="true">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: statCards }).map((_, index) => (
          <div key={`metric-${index}`} className="rounded-xl border border-slate-200/60 p-4 dark:border-slate-800">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-4 h-7 w-1/3" />
            <Skeleton className="mt-3 h-3 w-2/5" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200/60 p-4 lg:col-span-2 dark:border-slate-800">
          <Skeleton className="mb-4 h-5 w-1/3" />
          <ChartSkeleton height={260} />
        </div>

        <div className="rounded-xl border border-slate-200/60 p-4 dark:border-slate-800">
          <Skeleton className="mb-4 h-5 w-2/5" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={`activity-${index}`} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
