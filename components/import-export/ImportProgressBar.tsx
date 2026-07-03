'use client';

type Props = {
  processed: number;
  total: number;
  status: string;
};

export default function ImportProgressBar({ processed, total, status }: Props) {
  const progress = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="rounded border p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span>Status: {status}</span>
        <span>
          {processed}/{total}
        </span>
      </div>
      <div className="h-2 rounded bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-2 rounded bg-blue-600 transition-all"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </div>
  );
}
