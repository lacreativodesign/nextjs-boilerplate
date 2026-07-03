import { SkeletonDashboard } from '@/components/ui/Skeleton';

export default function AdminLoading() {
  return (
    <div className="page-frame py-6">
      <SkeletonDashboard />
    </div>
  );
}
