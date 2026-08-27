import { SkeletonDashboard, TableSkeleton } from '@/components/ui/Skeleton';

/**
 * DS-26. Replaces app/(modules)/finance/loading.tsx. That file sat in a route group holding
 * no page.tsx at all, so it declared the same URL segment as this module without owning
 * a page — ambiguous at best, and outright dead for (modules)/crm, since no /crm route
 * exists anywhere in the app.
 */
export default function FinanceLoading() {
  return (
    <div className="space-y-6">
      <SkeletonDashboard />
      <TableSkeleton rows={8} columns={7} showHeader />
    </div>
  );
}
