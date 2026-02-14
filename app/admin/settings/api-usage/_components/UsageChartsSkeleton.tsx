"use client";

export default function UsageChartsSkeleton() {
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2" aria-busy="true" aria-label="Loading usage charts">
      {["Endpoint Usage", "Real-time Usage"].map((title) => (
        <div key={title}>
          <h4 className="font-medium text-sm mb-2">{title}</h4>
          <div className="h-[260px] w-full animate-pulse rounded-lg bg-neutral-200/70 dark:bg-neutral-800/70" />
        </div>
      ))}
    </div>
  );
}
