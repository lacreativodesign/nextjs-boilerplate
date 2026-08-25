import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--surface-bg,var(--surface-muted))] px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 text-8xl font-black text-[var(--brand-navy-soft)]">404</div>
        <h1 className="screen-title mb-3">Page not found</h1>
        <p className="screen-subtitle mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-[var(--erp-blue)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--erp-blue-hover)]"
          >
            Go to Dashboard
          </Link>
          <a
            href="https://www.bizosto.com/pricing"
            className="rounded-lg border border-[var(--alert-info-text-dark)] bg-white px-6 py-2.5 text-sm font-medium text-[var(--text-slate-deep)] hover:bg-[var(--border-faint)]"
          >
            View Pricing
          </a>
        </div>
      </div>
    </div>
  );
}
