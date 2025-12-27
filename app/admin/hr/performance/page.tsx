"use client";

import { useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import { formatDate, useIsSystemDark } from "@/components/finance/financeUtils";

const RATING_OPTIONS = [
  { label: "All Ratings", value: "all" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "4", value: "4" },
  { label: "5", value: "5" },
];

type UserRecord = {
  uid: string;
  name?: string;
  role?: string;
};

type ReviewRecord = {
  id: string;
  userId: string;
  period: string;
  rating: number | null;
  tags: string[];
  notes: string;
  createdAt?: string | null;
};

export default function HrPerformancePage() {
  const isDark = useIsSystemDark();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterUser, setFilterUser] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("");
  const [filterRating, setFilterRating] = useState("all");
  const [filterTags, setFilterTags] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({
    userId: "",
    period: "",
    rating: "",
    tags: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const [usersRes, reviewsRes] = await Promise.all([
          fetch("/api/admin/hr/employees/list", { cache: "no-store", credentials: "include" }),
          fetch("/api/admin/hr/performance/list", { cache: "no-store", credentials: "include" }),
        ]);
        const usersJson = await usersRes.json();
        const reviewsJson = await reviewsRes.json();
        if (!usersRes.ok || !usersJson.ok) throw new Error(usersJson?.error || "Unable to load users.");
        if (!reviewsRes.ok || !reviewsJson.ok) throw new Error(reviewsJson?.error || "Unable to load reviews.");
        if (!alive) return;
        setUsers(usersJson.users || []);
        setReviews(reviewsJson.reviews || []);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Unable to load performance reviews.");
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

  const userOptions = useMemo(
    () => [{ label: "All Employees", value: "all" }, ...users.map((u) => ({ label: u.name || "Employee", value: u.uid }))],
    [users]
  );

  const filtered = useMemo(() => {
    const tagTerm = filterTags.trim().toLowerCase();
    return reviews.filter((review) => {
      const matchesUser = filterUser === "all" ? true : review.userId === filterUser;
      const matchesPeriod = filterPeriod ? review.period.toLowerCase().includes(filterPeriod.toLowerCase()) : true;
      const matchesRating = filterRating === "all" ? true : String(review.rating || "") === filterRating;
      const matchesTags = tagTerm
        ? review.tags.some((tag) => tag.toLowerCase().includes(tagTerm))
        : true;
      return matchesUser && matchesPeriod && matchesRating && matchesTags;
    });
  }, [reviews, filterUser, filterPeriod, filterRating, filterTags]);

  async function createReview() {
    try {
      setSaving(true);
      const payload = {
        userId: form.userId,
        period: form.period,
        rating: form.rating ? Number(form.rating) : null,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        notes: form.notes,
      };
      const res = await fetch("/api/admin/hr/performance/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "Unable to add review.");
      const refresh = await fetch("/api/admin/hr/performance/list", { cache: "no-store", credentials: "include" });
      const refreshData = await refresh.json();
      setReviews(refreshData.reviews || []);
      setForm({ userId: "", period: "", rating: "", tags: "", notes: "" });
      setDrawerOpen(false);
    } catch (err: any) {
      alert(err?.message || "Unable to add review.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card" style={{ padding: 18, borderRadius: 18 }}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Performance</div>
            <div style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
              Capture monthly or quarterly performance feedback.
            </div>
          </div>
          <button className="btn" onClick={() => setDrawerOpen(true)}>
            Add Review
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <MasterSelect value={filterUser} onChange={setFilterUser} options={userOptions} />
          <input
            className="input"
            placeholder="Filter by period"
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
          />
          <MasterSelect value={filterRating} onChange={setFilterRating} options={RATING_OPTIONS} />
          <input
            className="input"
            placeholder="Filter by tags"
            value={filterTags}
            onChange={(e) => setFilterTags(e.target.value)}
          />
        </div>
      </section>

      <section className="card" style={{ padding: 0, borderRadius: 18, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
            <thead>
              <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Employee</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Period</th>
                <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 700 }}>Rating</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Tags</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Notes</th>
                <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 700 }}>Logged</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                    Loading reviews…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "#ef4444" }}>
                    {error}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                    No performance reviews yet.
                  </td>
                </tr>
              ) : (
                filtered.map((review, idx) => {
                  const user = users.find((u) => u.uid === review.userId);
                  const rowBg = idx % 2 === 0 ? (isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)") : "transparent";
                  return (
                    <tr key={review.id} style={{ background: rowBg }}>
                      <td style={{ textAlign: "left", padding: "12px 16px" }}>{user?.name || "Employee"}</td>
                      <td style={{ textAlign: "left", padding: "12px 16px" }}>{review.period}</td>
                      <td style={{ textAlign: "right", padding: "12px 16px" }}>{review.rating ?? "-"}</td>
                      <td style={{ textAlign: "left", padding: "12px 16px" }}>{review.tags?.join(", ") || "-"}</td>
                      <td style={{ textAlign: "left", padding: "12px 16px" }}>{review.notes || "-"}</td>
                      <td style={{ textAlign: "right", padding: "12px 16px" }}>{formatDate(review.createdAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {drawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "min(480px, 92vw)",
              height: "100%",
              padding: 20,
              background: "var(--card-bg)",
              borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Add Performance Review</div>
                <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Keep reviews structured and concise.</div>
              </div>
              <button className="btn ghost" onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>
            <div style={{ height: 16 }} />
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500">Employee</label>
                <MasterSelect value={form.userId} onChange={(value) => setForm((prev) => ({ ...prev, userId: value }))} options={userOptions.slice(1)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Period (YYYY-MM or YYYY-Q#)</label>
                <input className="input" value={form.period} onChange={(e) => setForm((prev) => ({ ...prev, period: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Rating</label>
                <MasterSelect
                  value={form.rating}
                  onChange={(value) => setForm((prev) => ({ ...prev, rating: value }))}
                  options={RATING_OPTIONS.filter((opt) => opt.value !== "all")}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Tags (comma separated)</label>
                <input className="input" value={form.tags} onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Notes</label>
                <textarea className="input" rows={4} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ height: 16 }} />
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={createReview} disabled={saving || !form.userId || !form.period}>
                {saving ? "Saving..." : "Save Review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
