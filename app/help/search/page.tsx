import Link from 'next/link';
import { HelpSearch } from '@/components/help-center/HelpSearch';

type SearchPageProps = {
  searchParams: {
    q?: string;
    category?: string;
  };
};

export default function HelpSearchPage({ searchParams }: SearchPageProps) {
  const query = searchParams.q || '';
  const category = searchParams.category || '';

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-[var(--text-muted)]">
        <Link href="/help" className="hover:text-blue-700">
          Help
        </Link>
        <span className="mx-2">/</span>
        <span>Search</span>
      </nav>

      <h1 className="text-3xl font-semibold text-[var(--text-primary)]">Search documentation</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Find articles by keywords and filter by category.
      </p>

      <div className="mt-6">
        <HelpSearch initialQuery={query} initialCategory={category} mode="full" />
      </div>
    </main>
  );
}
