import { Skeleton } from '@/components/ui/Skeleton';

type FormSkeletonProps = {
  fields?: number;
  showActions?: boolean;
  className?: string;
};

export default function FormSkeleton({
  fields = 6,
  showActions = true,
  className = '',
}: FormSkeletonProps) {
  return (
    <div className={`space-y-5 ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: fields }).map((_, index) => (
        <div key={`form-field-${index}`} className="space-y-2">
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}

      {showActions ? (
        <div className="flex justify-end gap-3 pt-2">
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-10 w-28 rounded-full" />
        </div>
      ) : null}
    </div>
  );
}
