'use client';

import { useEffect, useMemo, useState } from 'react';
import { FILTER_TEMPLATES } from '@/lib/search/filter-templates';

type Operator =
  | 'equals'
  | 'contains'
  | 'greaterThan'
  | 'lessThan'
  | 'between'
  | 'in'
  | 'notEquals'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual';

type FilterRow = {
  id: string;
  field: string;
  operator: Operator;
  value: string;
};

type SavedSearch = {
  id: string;
  name: string;
  collection: string;
  query: string;
  searchFields: string[];
  filters: Array<{ field: string; operator: Operator; value: unknown }>;
  logic: 'AND' | 'OR';
};

type HistoryItem = {
  id: string;
  query: string;
  collection: string;
  resultsCount: number;
  timestamp: string | null;
};

type AnalyticsItem = {
  query: string;
  count: number;
  totalResults: number;
  avgResults: number;
};

type SearchRow = { id: string; [key: string]: unknown };

const DEFAULT_COLLECTION = 'searchIndex';
const DEFAULT_FIELDS = ['title', 'content', 'module', 'status'];

function parseFilterValue(operator: Operator, value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed.toLowerCase() === 'true' || trimmed.toLowerCase() === 'yes') return true;
  if (trimmed.toLowerCase() === 'false' || trimmed.toLowerCase() === 'no') return false;

  if (operator === 'between' || operator === 'in') {
    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const asNum = Number(item);
        return Number.isNaN(asNum) ? item : asNum;
      });
  }

  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return asNumber;
  }

  return trimmed;
}

function toCsv(rows: SearchRow[]) {
  if (!rows.length) return '';
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );

  const encode = (value: unknown) => {
    const normalized = value == null ? '' : String(value);
    return `"${normalized.replace(/"/g, '""')}"`;
  };

  const header = columns.map(encode).join(',');
  const body = rows.map((row) => columns.map((column) => encode(row[column])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export default function AdvancedSearchBuilder() {
  const [collection, setCollection] = useState(DEFAULT_COLLECTION);
  const [query, setQuery] = useState('');
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND');
  const [filters, setFilters] = useState<FilterRow[]>([
    { id: 'seed', field: 'status', operator: 'equals', value: '' },
  ]);
  const [results, setResults] = useState<SearchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsItem[]>([]);
  const [saveName, setSaveName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const activeFilters = useMemo(
    () =>
      filters.filter(
        (filter) =>
          filter.field.trim() &&
          (filter.value.trim() || filter.operator === 'equals' || filter.operator === 'notEquals'),
      ),
    [filters],
  );

  const runSearch = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/search/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection,
          query,
          searchFields: DEFAULT_FIELDS,
          filters: activeFilters.map((filter) => ({
            field: filter.field,
            operator: filter.operator,
            value: parseFilterValue(filter.operator, filter.value),
          })),
          logic,
          sortBy: 'createdAt',
          sortOrder: 'desc',
          limit: 100,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to run advanced search');
      }

      const data = await res.json();
      setResults(data.results || []);
      setTotal(Number(data.total || 0));
      void loadHistory();
      void loadAnalytics();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const loadSaved = async () => {
    const res = await fetch('/api/search/saved', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setSavedSearches(data.searches || []);
  };

  const loadHistory = async () => {
    const res = await fetch('/api/search/history?limit=10', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setHistory(data.history || []);
  };

  const loadAnalytics = async () => {
    const res = await fetch('/api/search/analytics?limit=100', { cache: 'no-store' });
    if (!res.ok) {
      setAnalytics([]);
      return;
    }
    const data = await res.json();
    setAnalytics(data.analytics || []);
  };

  const loadSuggestions = async (term: string) => {
    if (!term.trim()) {
      setSuggestions([]);
      return;
    }

    const params = new URLSearchParams({ q: term.trim(), limit: '8' });
    const res = await fetch(`/api/search/suggestions?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setSuggestions(data.suggestions || []);
  };

  useEffect(() => {
    void loadSaved();
    void loadHistory();
    void loadAnalytics();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadSuggestions(query);
    }, 200);

    return () => clearTimeout(t);
  }, [query]);

  const addFilter = () => {
    setFilters((prev) => [
      ...prev,
      { id: `${Date.now()}_${prev.length}`, field: '', operator: 'equals', value: '' },
    ]);
  };

  const removeFilter = (id: string) => {
    setFilters((prev) => prev.filter((filter) => filter.id !== id));
  };

  const updateFilter = (id: string, patch: Partial<FilterRow>) => {
    setFilters((prev) =>
      prev.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter)),
    );
  };

  const handleSave = async () => {
    if (!saveName.trim()) {
      setMessage('Saved search name is required.');
      return;
    }

    const res = await fetch('/api/search/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: saveName.trim(),
        collection,
        query,
        searchFields: DEFAULT_FIELDS,
        filters: activeFilters.map((filter) => ({
          field: filter.field,
          operator: filter.operator,
          value: parseFilterValue(filter.operator, filter.value),
        })),
        logic,
      }),
    });

    if (!res.ok) {
      setMessage('Failed to save search.');
      return;
    }

    setSaveName('');
    setMessage('Search saved.');
    void loadSaved();
  };

  const applySavedSearch = (saved: SavedSearch) => {
    setCollection(saved.collection);
    setQuery(saved.query);
    setLogic(saved.logic);
    setFilters(
      saved.filters.length
        ? saved.filters.map((filter, index) => ({
            id: `${saved.id}_${index}`,
            field: filter.field,
            operator: filter.operator,
            value: Array.isArray(filter.value)
              ? filter.value.join(', ')
              : String(filter.value ?? ''),
          }))
        : [{ id: `${saved.id}_seed`, field: '', operator: 'equals', value: '' }],
    );
  };

  const deleteSaved = async (id: string) => {
    const res = await fetch(`/api/search/saved/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSavedSearches((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const applyTemplate = (templateId: string) => {
    const template = FILTER_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    setCollection(template.collection);
    setLogic(template.logic);
    setFilters(
      template.filters.map((filter, index) => ({
        id: `${template.id}_${index}`,
        field: filter.field,
        operator: filter.operator,
        value: Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value ?? ''),
      })),
    );
  };

  const exportCsv = () => {
    const csv = toCsv(results);
    if (!csv) {
      setMessage('No results to export.');
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `advanced-search-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <aside className="card p-4">
        <h2 className="text-sm font-semibold">Saved searches</h2>
        <div className="mt-3 space-y-2">
          {savedSearches.length === 0 ? (
            <div className="text-xs text-[var(--text-soft)]">No saved searches yet.</div>
          ) : null}
          {savedSearches.map((saved) => (
            <div key={saved.id} className="rounded border border-[var(--border-subtle)] p-2">
              <button
                type="button"
                className="w-full text-left text-sm font-medium"
                onClick={() => applySavedSearch(saved)}
              >
                {saved.name}
              </button>
              <button
                type="button"
                className="mt-1 text-xs text-red-600"
                onClick={() => deleteSaved(saved.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="space-y-4">
        <section className="card p-4">
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="input"
              placeholder="Collection (e.g. invoices, projects, searchIndex)"
              value={collection}
              onChange={(event) => setCollection(event.target.value)}
            />
            <div>
              <input
                className="input"
                placeholder="Search query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {suggestions.length > 0 ? (
                <div className="mt-1 rounded border border-[var(--border-subtle)] bg-white p-1 text-sm dark:bg-[var(--surface)]">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left hover:bg-[var(--surface-muted)]"
                      onClick={() => setQuery(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`rounded px-3 py-1 text-sm ${logic === 'AND' ? 'bg-blue-600 text-white' : 'bg-neutral-100'}`}
              onClick={() => setLogic('AND')}
            >
              AND
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 text-sm ${logic === 'OR' ? 'bg-blue-600 text-white' : 'bg-neutral-100'}`}
              onClick={() => setLogic('OR')}
            >
              OR
            </button>
            <select
              className="input max-w-xs"
              onChange={(event) => applyTemplate(event.target.value)}
              defaultValue=""
            >
              <option value="">Apply filter template...</option>
              {FILTER_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <button type="button" className="rounded border px-3 py-2 text-sm" onClick={addFilter}>
              + Add filter
            </button>
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-2 text-sm text-white"
              onClick={runSearch}
              disabled={loading}
            >
              {loading ? 'Searching...' : 'Run search'}
            </button>
            <button
              type="button"
              className="rounded bg-emerald-600 px-3 py-2 text-sm text-white"
              onClick={exportCsv}
            >
              Export CSV
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {filters.map((filter) => (
              <div key={filter.id} className="grid gap-2 md:grid-cols-[1fr_180px_1fr_auto]">
                <input
                  className="input"
                  value={filter.field}
                  placeholder="Field"
                  onChange={(event) => updateFilter(filter.id, { field: event.target.value })}
                />
                <select
                  className="input"
                  value={filter.operator}
                  onChange={(event) =>
                    updateFilter(filter.id, { operator: event.target.value as Operator })
                  }
                >
                  <option value="equals">equals</option>
                  <option value="notEquals">notEquals</option>
                  <option value="contains">contains</option>
                  <option value="greaterThan">greaterThan</option>
                  <option value="lessThan">lessThan</option>
                  <option value="greaterThanOrEqual">greaterThanOrEqual</option>
                  <option value="lessThanOrEqual">lessThanOrEqual</option>
                  <option value="between">between (comma separated)</option>
                  <option value="in">in (comma separated)</option>
                </select>
                <input
                  className="input"
                  value={filter.value}
                  placeholder="Value"
                  onChange={(event) => updateFilter(filter.id, { value: event.target.value })}
                />
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm"
                  onClick={() => removeFilter(filter.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              className="input"
              placeholder="Saved search name"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
            />
            <button
              type="button"
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
              onClick={handleSave}
            >
              Save search
            </button>
          </div>

          {message ? <div className="mt-2 text-sm text-[var(--text-soft)]">{message}</div> : null}
        </section>

        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Search history</h3>
            <select
              className="input max-w-xs"
              onChange={(event) => {
                const item = history.find((entry) => entry.id === event.target.value);
                if (!item) return;
                setCollection(item.collection);
                setQuery(item.query);
              }}
              defaultValue=""
            >
              <option value="">Load recent query...</option>
              {history.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.query} ({item.resultsCount})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 text-sm">
            {history.map((item) => (
              <div key={item.id} className="rounded border border-[var(--border-subtle)] p-2">
                <div className="font-medium">{item.query || '(empty query)'}</div>
                <div className="text-xs text-[var(--text-soft)]">
                  {item.collection} · {item.resultsCount} results
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <div className="mb-2 text-sm font-semibold">Results ({total})</div>
          <div className="max-h-[420px] overflow-auto text-sm">
            {results.length === 0 ? (
              <div className="text-[var(--text-soft)]">No results.</div>
            ) : null}
            {results.map((row) => (
              <pre
                key={String(row.id)}
                className="mb-2 whitespace-pre-wrap rounded border border-[var(--border-subtle)] p-2"
              >
                {JSON.stringify(row, null, 2)}
              </pre>
            ))}
          </div>
        </section>

        {analytics.length > 0 ? (
          <section className="card p-4">
            <h3 className="mb-2 text-sm font-semibold">Search analytics (admin)</h3>
            <div className="space-y-2 text-sm">
              {analytics.map((item) => (
                <div
                  key={item.query}
                  className="flex items-center justify-between rounded border border-[var(--border-subtle)] p-2"
                >
                  <span>{item.query}</span>
                  <span className="text-xs text-[var(--text-soft)]">
                    {item.count} searches · avg {item.avgResults} results
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
