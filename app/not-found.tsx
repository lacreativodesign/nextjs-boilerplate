import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--surface-bg,#F8FAFC)] px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 text-8xl font-black text-[#1E3A5F]">404</div>
        <h1 className="mb-3 text-2xl font-bold text-[#1E293B]">Page not found</h1>
        <p className="mb-8 text-sm text-[#64748B]">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-[#2563EB] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#1d4ed8]"
          >
            Go to Dashboard
          </Link>
          <a
            href="https://www.bizosto.com/pricing"
            className="rounded-lg border border-[#E2E8F0] bg-white px-6 py-2.5 text-sm font-medium text-[#1E293B] hover:bg-[#F1F5F9]"
          >
            View Pricing
          </a>
        </div>
      </div>
    </div>
  );
}
