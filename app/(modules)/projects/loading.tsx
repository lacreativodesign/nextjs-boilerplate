import DashboardSkeleton from '@/components/ui/skeleton/DashboardSkeleton';
import TableSkeleton from '@/components/ui/skeleton/TableSkeleton';

export default function ProjectsLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <DashboardSkeleton />
      <TableSkeleton rows={10} columns={6} />
    </div>
  );
}
