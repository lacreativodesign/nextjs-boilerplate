"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type ActivityEvent = {
  id: string;
  type: string;
  title: string;
  description: string;
  createdAt: string | null;
  actorName: string | null;
  entityType: string | null;
};

export default function SuperAdminActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [range, setRange] = useState("30");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (type) params.set("type", type);
      const res = await fetch(`/api/super_admin/events/list?${params}`, { credentials: "include" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to load");
      setEvents(data.events || []);
    } catch (err: any) {
      const msg = err?.message || "";
      setError(
        msg.includes("Session") || msg.includes("Unauthorized")
          ? "Your session has expired. Please refresh the page."
          : msg.includes("index") || msg.includes("Index")
          ? "Activity feed is being set up. Check back in a moment."
          : "Unable to load activity. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = events.filter((e) => {
    const days = parseInt(range);
    if (!e.createdAt) return true;
    const diff = (Date.now() - new Date(e.createdAt).getTime()) / 86400000;
    return diff <= days;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Activity</h2>
          <p className="text-sm text-[var(--text-muted)]">Tenant-scoped audit activity across core workflows.</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="btn flex items-center gap-2"
          style={{ borderRadius: 999 }}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <input
          type="text"
          className="input w-full"
          placeholder="Search activity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <div className="grid grid-cols-2 gap-3">
          <select className="input w-full" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="deleted">Deleted</option>
          </select>
          <select className="input w-full" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
        </div>
      </div>

      {/* Results */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-sm text-[var(--text-muted)]">Loading activity...</div>
        ) : error ? (
          <div className="p-6 text-center text-sm text-[var(--text-muted)]">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--text-muted)]">No activity found for this period.</div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {filtered.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{e.title || e.type}</p>
                  {e.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{e.description}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  {e.actorName && <p className="text-xs text-[var(--text-muted)]">{e.actorName}</p>}
                  {e.createdAt && (
                    <p className="text-xs text-[var(--text-muted)]">{new Date(e.createdAt).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
