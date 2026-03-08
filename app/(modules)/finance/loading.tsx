import DashboardSkeleton from "@/components/ui/skeleton/DashboardSkeleton";
import TableSkeleton from "@/components/ui/skeleton/TableSkeleton";

export default function FinanceLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <DashboardSkeleton />
      <TableSkeleton rows={8} columns={7} />
    </div>
  );
}
