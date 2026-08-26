import Link from 'next/link';

export default function UnbuiltFeaturePage() {
  return (
    <section className="card space-y-4 rounded-2xl p-6" aria-labelledby="retainers-title">
      <div>
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          Controlled-beta limitation
        </p>
        <h3 id="retainers-title" className="mt-1 text-xl font-bold">
          Retainer scheduling is not yet available
        </h3>
      </div>
      <p className="max-w-2xl text-sm text-[var(--text-muted)]">
        Client retainer status can be recorded today, but automated retainer schedules and billing
        are not implemented. Use recurring invoices only after that workflow has been verified in an
        isolated billing sandbox.
      </p>
      <Link className="btn inline-flex w-fit" href="/admin/finance/invoices">
        Return to invoices
      </Link>
    </section>
  );
}
