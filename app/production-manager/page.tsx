"use client";

import Link from "next/link";

export default function ProductionManagerPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Production Manager</h1>
        <p className="text-sm text-[var(--text-muted)]">
          This dashboard is coming online. Use the button below to return to your production workspace.
        </p>
      </div>
      <Link className="btn w-fit" href="/production">
        Go to Production
      </Link>
    </div>
  );
}
