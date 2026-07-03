import DashboardSkeleton from '@/components/ui/skeleton/DashboardSkeleton';
import TableSkeleton from '@/components/ui/skeleton/TableSkeleton';

export default function CrmLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <DashboardSkeleton />
      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}
