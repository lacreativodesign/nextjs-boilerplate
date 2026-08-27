import {
  Skeleton,
  SkeletonCard,
  SkeletonDashboard,
  SkeletonForm,
  TableSkeleton,
} from '@/components/ui/Skeleton';

export type PageLoadingProps = {
  /**
   * The shape of what is arriving. `dashboard` for KPI-and-chart index pages, `table`
   * for list views, `form` for settings, `cards` for a grid of records.
   */
  variant?: 'dashboard' | 'table' | 'form' | 'cards';
  columns?: number;
  rows?: number;
};

/**
 * DS-27 — the route-level loading state.
 *
 * Seventeen modules covering 135 pages had no `loading.tsx`, so navigating between
 * them showed the previous route frozen until the next one mounted, then swapped the
 * whole page at once. Next.js renders this automatically for the whole segment, so one
 * small file per module covers every route beneath it.
 *
 * It leads with a title and subtitle placeholder because DS-6 through DS-25 gave every
 * page an `h1` and a `.page-subtitle`. Without them the heading pops in above content
 * that was already occupying the space, which is the jump this is meant to prevent.
 */
export default function PageLoading({
  variant = 'dashboard',
  columns = 6,
  rows = 8,
}: PageLoadingProps) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div className="space-y-2">
        {/* Matches .page-title at its clamp minimum, and .page-subtitle beneath it. */}
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {variant === 'dashboard' ? <SkeletonDashboard /> : null}
      {variant === 'table' ? <TableSkeleton rows={rows} columns={columns} showHeader /> : null}
      {variant === 'form' ? <SkeletonForm fields={6} /> : null}
      {variant === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={`card-${index}`} lines={3} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
