"use client";

import Link from "next/link";

export default function AMManagerPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Account Management Manager</h1>
        <p className="text-sm text-[var(--text-muted)]">
          This dashboard is coming online. Use the button below to return to your primary workspace.
        </p>
      </div>
      <Link className="btn w-fit" href="/am">
        Go to Account Management
      </Link>
    </div>
  );
}
