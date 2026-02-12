"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

type RecentSearch = {
  id: string;
  query: string;
  updatedAt: string | null;
  filters?: {
    module?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  };
};

type Filters = {
  module: string;
  status: string;
  dateFrom: string;
  dateTo: string;
};

const MODULE_OPTIONS = ["all", "users", "customers", "projects", "invoices", "documents", "payments", "expenses", "inventory"];

function HighlightText({ text, tokens }: { text: string; tokens: string[] }) {
  const lowered = text.toLowerCase();
  const token = tokens.find((item) => item && lowered.includes(item.toLowerCase()));
  if (!token) return <>{text}</>;
  const idx = lowered.indexOf(token.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-yellow-200/80 px-0.5 text-[var(--text-primary)]">{text.slice(idx, idx + token.length)}</mark>
      {text.slice(idx + token.length)}
    </>
  );
}

export default function GlobalSearchModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({ module: "all", status: "", dateFrom: "", dateTo: "" });

  const queryTokens = useMemo(
    () => query.split(/\s+/).map((token) => token.trim()).filter(Boolean),
    [query],
  );

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("bizosto:search-open", onOpen);
    return () => window.removeEventListener("bizosto:search-open", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const run = async () => {
      try {
        const res = await fetch("/api/search/recent", { cache: "no-store" });
        const data = await res.json();
        if (res.ok) setRecents(data.results || []);
      } catch (error) {
        console.error("Failed to load recent searches", error);
      }
    };
    void run();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          module: filters.module,
          status: filters.status,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          limit: "30",
        });

        const res = await fetch(`/api/search/global?${params.toString()}`, { cache: "no-store" });
        const data = await res.json();
        setResults(data.results || []);
      } catch (error) {
        console.error("Global search failed", error);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [open, query, filters]);

  const grouped = useMemo(() => {
    return results.reduce<Record<string, SearchResult[]>>((acc, item) => {
      if (!acc[item.module]) acc[item.module] = [];
      acc[item.module].push(item);
      return acc;
    }, {});
  }, [results]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 px-4 py-12">
      <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] p-3">
          <Search className="h-5 w-5 text-[var(--text-soft)]" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search across modules"
            className="w-full bg-transparent text-sm outline-none"
          />
          <button type="button" onClick={() => setShowFilters((prev) => !prev)} className="btn btn-secondary h-9 px-3">
            <SlidersHorizontal className="mr-1 h-4 w-4" /> Filters
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-[var(--surface-muted)]" aria-label="Close search">
            <X className="h-4 w-4" />
          </button>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-b border-[var(--border-subtle)] p-4 md:grid-cols-4">
            <select className="input" value={filters.module} onChange={(event) => setFilters((prev) => ({ ...prev, module: event.target.value }))}>
              {MODULE_OPTIONS.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>
            <input className="input" placeholder="Status" value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))} />
            <input className="input" type="date" value={filters.dateFrom} onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))} />
            <input className="input" type="date" value={filters.dateTo} onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))} />
          </div>
        )}

        {!query.trim() && recents.length > 0 ? (
          <div className="max-h-[60vh] overflow-auto p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-soft)]">Recent searches</div>
            <div className="space-y-2">
              {recents.map((recent) => (
                <button
                  key={recent.id}
                  type="button"
                  className="w-full rounded-xl border border-[var(--border-subtle)] p-3 text-left hover:bg-[var(--surface-muted)]"
                  onClick={() => setQuery(recent.query)}
                >
                  <div className="text-sm font-medium">{recent.query}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto p-4">
            {loading ? <div className="text-sm text-[var(--text-soft)]">Searching…</div> : null}
            {!loading && results.length === 0 ? <div className="text-sm text-[var(--text-soft)]">No results found.</div> : null}

            {Object.entries(grouped).map(([module, items]) => (
              <div key={module} className="mb-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-soft)]">{module}</div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <button
                      key={`${module}_${item.id}`}
                      type="button"
                      className="w-full rounded-xl border border-[var(--border-subtle)] p-3 text-left hover:bg-[var(--surface-muted)]"
                      onClick={() => {
                        setOpen(false);
                        router.push(item.href);
                      }}
                    >
                      <div className="text-sm font-semibold">
                        <HighlightText text={item.title} tokens={queryTokens} />
                      </div>
                      <div className="text-xs text-[var(--text-soft)]">
                        <HighlightText text={item.subtitle || item.highlights.join(" … ")} tokens={queryTokens} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] p-3 text-xs text-[var(--text-soft)]">
          <span>Press ESC to close</span>
          <button
            type="button"
            className="font-semibold text-[var(--text-primary)]"
            onClick={() => {
              setOpen(false);
              router.push(`/search?q=${encodeURIComponent(query)}`);
            }}
          >
            Open full results
          </button>
        </div>
      </div>
    </div>
  );
}
