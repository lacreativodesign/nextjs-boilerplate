import { SkeletonDashboard } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="page-frame py-6">
      <SkeletonDashboard />
    </div>
  );
}
