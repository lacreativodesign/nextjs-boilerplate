import Link from 'next/link';

export default function UnbuiltFeaturePage() {
  return (
    <section className="card space-y-4 rounded-2xl p-6" aria-labelledby="estimates-title">
      <div>
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          Controlled-beta limitation
        </p>
        <h3 id="estimates-title" className="mt-1 text-xl font-bold">
          Estimates are not yet available
        </h3>
      </div>
      <p className="max-w-2xl text-sm text-[var(--text-muted)]">
        This route does not yet provide an estimate lifecycle, approval history, or conversion to an
        invoice. No estimate will be presented as issued until those controls are implemented and
        verified.
      </p>
      <Link className="btn inline-flex w-fit" href="/admin/finance/invoices">
        Return to invoices
      </Link>
    </section>
  );
}
