import { Suspense } from 'react';
import DashboardSkeleton from '@/components/ui/skeleton/DashboardSkeleton';

export default function ModulesLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<DashboardSkeleton className="p-4 md:p-6" />}>{children}</Suspense>;
}
