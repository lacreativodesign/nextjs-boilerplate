"use client";

import { useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import { formatDateTime } from "@/components/finance/financeUtils";

const TYPE_OPTIONS = [
  { label: "All Types", value: "all" },
  { label: "User Updated", value: "hr.user_updated" },
  { label: "Role Changed", value: "hr.role_changed" },
  { label: "Onboarding Assigned", value: "hr.onboarding_assigned" },
  { label: "Onboarding Completed", value: "hr.onboarding_completed" },
  { label: "Document Uploaded", value: "hr.document_uploaded" },
  { label: "Performance Review Added", value: "hr.performance_review_added" },
];

type ActivityRecord = {
  id: string;
  type: string;
  title: string;
  description: string;
  createdAt?: string | null;
  createdByName?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export default function HrActivityPage() {
    const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/hr/activity/list", { cache: "no-store", credentials: "include" });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data?.error || "Unable to load activity.");
        if (!alive) return;
        setActivity(data.activity || []);
      } catch (err) {
        if (!alive) return;
        setError((err instanceof Error ? err.message : undefined) || "Unable to load activity.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activity.filter((event) => {
      const matchesType = typeFilter === "all" ? true : event.type === typeFilter;
      const matchesSearch = !term
        ? true
        : [event.title, event.description, event.createdByName]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term));
      const created = event.createdAt ? new Date(event.createdAt) : null;
      const matchesStart = dateStart && created ? created >= new Date(dateStart) : true;
      const matchesEnd = dateEnd && created ? created <= new Date(`${dateEnd}T23:59:59`) : true;
      return matchesType && matchesSearch && matchesStart && matchesEnd;
    });
  }, [activity, search, typeFilter, dateStart, dateEnd]);

  return (
    <div className="space-y-6">
      <section className="card" style={{ padding: 18, borderRadius: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>HR Activity</div>
        <div style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
          Audit trail of HR actions across onboarding, users, and documents.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input className="input" placeholder="Search keyword" value={search} onChange={(e) => setSearch(e.target.value)} />
          <MasterSelect value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
          <input className="input" type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          <input className="input" type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
        </div>
      </section>

      <section className="card" style={{ padding: 0, borderRadius: 18, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
            <thead>
              <tr style={{ background: "var(--table-header-bg)" }}>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Event</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Actor</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Summary</th>
                <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 700 }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: 24 }}>
                    Loading activity…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: 24, color: "#ef4444" }}>
                    {error}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: 24 }}>
                    No activity found.
                  </td>
                </tr>
              ) : (
                filtered.map((event) => {

                  return (
                    <tr key={event.id}>
                      <td style={{ textAlign: "left", padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600 }}>{event.title || event.type}</div>
                        <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>{event.type}</div>
                      </td>
                      <td style={{ textAlign: "left", padding: "12px 16px" }}>{event.createdByName || "-"}</td>
                      <td style={{ textAlign: "left", padding: "12px 16px" }}>{event.description || "-"}</td>
                      <td style={{ textAlign: "right", padding: "12px 16px" }}>{formatDateTime(event.createdAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
