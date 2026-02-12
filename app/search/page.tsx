"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";

type SearchResult = {
  id: string;
  module: string;
  title: string;
  subtitle: string;
  status?: string;
  date?: string;
  href: string;
  score: number;
  highlights: string[];
};

const MODULE_OPTIONS = ["all", "users", "customers", "projects", "invoices", "documents", "payments", "expenses", "inventory"];
const ALLOWED_ROLES = ["super_admin", "admin", "sales", "sales_manager", "am", "am_manager", "production", "production_manager", "client", "hr", "finance"];

export default function SearchResultsPage() {
  const searchParams = useSearchParams();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const query = (searchParams.get("q") || "").trim();

  useEffect(() => {
    if (!query) return;
    const run = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query,
          module: moduleFilter,
          status: statusFilter,
          dateFrom,
          dateTo,
          limit: "100",
        });
        const res = await fetch(`/api/search/global?${params.toString()}`, { cache: "no-store" });
        const data = await res.json();
        setResults(data.results || []);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [query, moduleFilter, statusFilter, dateFrom, dateTo]);

  const grouped = useMemo(() => {
    return results.reduce<Record<string, SearchResult[]>>((acc, item) => {
      if (!acc[item.module]) acc[item.module] = [];
      acc[item.module].push(item);
      return acc;
    }, {});
  }, [results]);

  return (
    <RequireAuth allowed={ALLOWED_ROLES}>
      <AppShell>
        <div className="space-y-4">
          <div className="card p-4">
            <h1 className="text-xl font-semibold">Search results</h1>
            <p className="text-sm text-[var(--text-soft)]">Query: {query || "-"}</p>
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <select className="input" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
                {MODULE_OPTIONS.map((module) => (
                  <option key={module} value={module}>
                    {module}
                  </option>
                ))}
              </select>
              <input className="input" placeholder="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} />
              <input className="input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <input className="input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </div>

          <div className="card p-4">
            {loading ? <div className="text-sm text-[var(--text-soft)]">Searching…</div> : null}
            {!loading && results.length === 0 ? <div className="text-sm text-[var(--text-soft)]">No matches found.</div> : null}

            {Object.entries(grouped).map(([module, items]) => (
              <section key={module} className="mb-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--text-soft)]">{module}</h2>
                <div className="space-y-2">
                  {items.map((item) => (
                    <Link key={`${item.module}_${item.id}`} href={item.href} className="block rounded-xl border border-[var(--border-subtle)] p-3 hover:bg-[var(--surface-muted)]">
                      <div className="text-sm font-semibold">{item.title}</div>
                      <div className="text-xs text-[var(--text-soft)]">{item.subtitle || item.highlights.join(" … ")}</div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
