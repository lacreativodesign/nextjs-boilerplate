"use client";
import { useEffect, useState, useMemo } from "react";

type UserRecord = { uid: string; name?: string; role?: string; department?: string };
type ReviewRecord = { id: string; userId: string; period: string; rating: number | null; notes: string };
type Target = { userId: string; metric: string; target: number; achieved: number; period: string };

const SCORE_COLOR = (pct: number) =>
  pct >= 90 ? "#10b981" : pct >= 75 ? "#3b82f6" : pct >= 50 ? "#f59e0b" : "#ef4444";

const SCORE_LABEL = (pct: number) =>
  pct >= 90 ? "Exceeding" : pct >= 75 ? "On Track" : pct >= 50 ? "Needs Improvement" : "Underperforming";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  const color = SCORE_COLOR(pct);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span style={{ color }} className="font-semibold">{SCORE_LABEL(pct)}</span>
        <span className="text-[var(--text-muted)]">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--surface-muted)]">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="text-xs text-[var(--text-muted)]">
        {value.toLocaleString()} / {max.toLocaleString()}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub: string; color?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-3xl font-bold" style={{ color: color || "var(--text-primary)" }}>
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--text-soft)]">{sub}</p>
    </div>
  );
}

export default function PerformancePage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"individual" | "department" | "org">("individual");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ userId: "", metric: "Revenue", target: "", achieved: "", period: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const [uRes, rRes] = await Promise.all([
          fetch("/api/admin/users/list", { credentials: "include" }),
          fetch("/api/hr/performance/list", { credentials: "include" }),
        ]);
        const uData = await uRes.json().catch(() => ({}));
        const rData = await rRes.json().catch(() => ({}));
        if (!alive) return;
        const userList = Array.isArray(uData) ? uData : uData?.users || [];
        setUsers(userList);
        setReviews(rData?.reviews || []);
        // Build mock targets from reviews for now
        const builtTargets: Target[] = (rData?.reviews || []).map((r: ReviewRecord) => ({
          userId: r.userId,
          metric: "Performance Rating",
          target: 5,
          achieved: r.rating || 0,
          period: r.period,
        }));
        setTargets(builtTargets);
      } catch (err) {
        console.error("Performance load error", err);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  const departments = useMemo(() => {
    const depts = new Set(users.map(u => u.department || "Unassigned").filter(Boolean));
    return Array.from(depts);
  }, [users]);

  const getUserName = (uid: string) =>
    users.find(u => u.uid === uid)?.name || "Unknown";

  const avgRating = useMemo(() => {
    const rated = reviews.filter(r => r.rating !== null);
    if (!rated.length) return 0;
    return rated.reduce((sum, r) => sum + (r.rating || 0), 0) / rated.length;
  }, [reviews]);

  const topPerformer = useMemo(() => {
    if (!reviews.length) return "—";
    const byUser = new Map<string, number[]>();
    reviews.forEach(r => {
      if (r.rating) {
        if (!byUser.has(r.userId)) byUser.set(r.userId, []);
        byUser.get(r.userId)!.push(r.rating);
      }
    });
    let best = { uid: "", avg: 0 };
    byUser.forEach((ratings, uid) => {
      const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      if (avg > best.avg) best = { uid, avg };
    });
    return best.uid ? getUserName(best.uid) : "—";
  }, [reviews, users]);

  const deptStats = useMemo(() => {
    return departments.map(dept => {
      const deptUsers = users.filter(u => (u.department || "Unassigned") === dept);
      const deptUids = new Set(deptUsers.map(u => u.uid));
      const deptReviews = reviews.filter(r => deptUids.has(r.userId) && r.rating !== null);
      const avg = deptReviews.length
        ? deptReviews.reduce((s, r) => s + (r.rating || 0), 0) / deptReviews.length
        : 0;
      return { dept, userCount: deptUsers.length, reviewCount: deptReviews.length, avg };
    });
  }, [departments, users, reviews]);

  const handleSaveTarget = async () => {
    if (!form.userId || !form.metric || !form.target || !form.period) return;
    try {
      setSaving(true);
      const newTarget: Target = {
        userId: form.userId,
        metric: form.metric,
        target: Number(form.target),
        achieved: Number(form.achieved) || 0,
        period: form.period,
      };
      setTargets(prev => [...prev, newTarget]);
      setForm({ userId: "", metric: "Revenue", target: "", achieved: "", period: "" });
      setAddOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = selectedUser === "all" ? users : users.filter(u => u.uid === selectedUser);

  if (loading) return (
    <div className="card p-6 text-[var(--text-muted)]">Loading performance data...</div>
  );

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Reviews" value={reviews.length} sub="All time" />
        <StatCard
          label="Avg Rating"
          value={avgRating ? avgRating.toFixed(1) + " / 5" : "—"}
          sub="Across all employees"
          color={avgRating >= 4 ? "#10b981" : avgRating >= 3 ? "#3b82f6" : "#f59e0b"}
        />
        <StatCard label="Top Performer" value={topPerformer} sub="Highest avg rating" color="#10b981" />
        <StatCard label="Departments" value={departments.length} sub="Active departments" />
      </div>

      {/* View Tabs */}
      <div className="flex gap-2 border-b border-[var(--border-subtle)] pb-0">
        {(["individual", "department", "org"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-[var(--erp-blue)] text-[var(--erp-blue)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}>
            {tab === "org" ? "Organization" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <div className="ml-auto">
          <button onClick={() => setAddOpen(true)}
            className="btn text-sm px-4 py-2">
            + Set Target
          </button>
        </div>
      </div>

      {/* Individual View */}
      {activeTab === "individual" && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center">
            <select className="input max-w-xs" value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}>
              <option value="all">All Employees</option>
              {users.map(u => (
                <option key={u.uid} value={u.uid}>{u.name || u.uid}</option>
              ))}
            </select>
          </div>
          <div className="space-y-3">
            {filteredUsers.map(user => {
              const userReviews = reviews.filter(r => r.userId === user.uid && r.rating !== null);
              const userTargets = targets.filter(t => t.userId === user.uid);
              const avgR = userReviews.length
                ? userReviews.reduce((s, r) => s + (r.rating || 0), 0) / userReviews.length
                : 0;
              const pct = Math.round((avgR / 5) * 100);
              return (
                <div key={user.uid}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-[var(--erp-blue)] flex items-center justify-center text-white text-sm font-bold">
                          {(user.name || "U").slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {user.name || "Unnamed"}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {user.role} · {user.department || "No dept"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{
                        background: SCORE_COLOR(pct) + "20",
                        color: SCORE_COLOR(pct)
                      }}>
                      {SCORE_LABEL(pct)}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {userReviews.length > 0 ? (
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-2 font-medium">
                          Performance Rating
                        </p>
                        <ProgressBar value={avgR} max={5} />
                      </div>
                    ) : null}

                    {userTargets.map((t, i) => (
                      <div key={i}>
                        <p className="text-xs text-[var(--text-muted)] mb-2 font-medium">
                          {t.metric} · {t.period}
                        </p>
                        <ProgressBar value={t.achieved} max={t.target} />
                      </div>
                    ))}

                    {!userReviews.length && !userTargets.length && (
                      <p className="text-sm text-[var(--text-muted)]">
                        No performance data yet.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Department View */}
      {activeTab === "department" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {deptStats.map(({ dept, userCount, reviewCount, avg }) => {
            const pct = Math.round((avg / 5) * 100);
            return (
              <div key={dept}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-[var(--text-primary)]">{dept}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {userCount} members · {reviewCount} reviews
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full"
                    style={{ background: SCORE_COLOR(pct) + "20", color: SCORE_COLOR(pct) }}>
                    {avg ? avg.toFixed(1) + "/5" : "No data"}
                  </span>
                </div>
                {avg > 0 ? (
                  <ProgressBar value={avg} max={5} />
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">No reviews logged yet.</p>
                )}
              </div>
            );
          })}
          {deptStats.length === 0 && (
            <p className="text-[var(--text-muted)] col-span-2">
              No department data available.
            </p>
          )}
        </div>
      )}

      {/* Organization View */}
      {activeTab === "org" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
            <p className="font-bold text-[var(--text-primary)] mb-4">
              Organization Performance
            </p>
            <ProgressBar value={avgRating} max={5} />
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {deptStats.map(({ dept, avg }) => (
                <div key={dept} className="rounded-lg bg-[var(--surface-muted)] p-3">
                  <p className="text-xs font-semibold text-[var(--text-muted)] mb-1">{dept}</p>
                  <div className="h-1.5 w-full rounded-full bg-[var(--border-subtle)]">
                    <div className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.round((avg / 5) * 100)}%`,
                        backgroundColor: SCORE_COLOR(Math.round((avg / 5) * 100))
                      }} />
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {avg ? avg.toFixed(1) + "/5" : "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Set Target Modal */}
      {addOpen && (
        <div className="drawer-overlay" onClick={() => setAddOpen(false)}>
          <div className="drawer-panel drawer-panel--sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Set Performance Target</h2>
                <p className="text-sm text-[var(--text-muted)]">Assign a measurable KPI target to a user.</p>
              </div>
              <button className="btn ghost" onClick={() => setAddOpen(false)}>Close</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  Employee *
                </label>
                <select className="input w-full" value={form.userId}
                  onChange={e => setForm(p => ({ ...p, userId: e.target.value }))}>
                  <option value="">Select employee</option>
                  {users.map(u => (
                    <option key={u.uid} value={u.uid}>{u.name || u.uid}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  Metric *
                </label>
                <select className="input w-full" value={form.metric}
                  onChange={e => setForm(p => ({ ...p, metric: e.target.value }))}>
                  <option>Revenue</option>
                  <option>Deals Closed</option>
                  <option>Leads Generated</option>
                  <option>Tasks Completed</option>
                  <option>Client Satisfaction</option>
                  <option>Attendance Rate</option>
                  <option>Projects Delivered</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                    Target *
                  </label>
                  <input className="input w-full" type="number" placeholder="e.g. 100"
                    value={form.target}
                    onChange={e => setForm(p => ({ ...p, target: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                    Achieved so far
                  </label>
                  <input className="input w-full" type="number" placeholder="e.g. 75"
                    value={form.achieved}
                    onChange={e => setForm(p => ({ ...p, achieved: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  Period * (e.g. 2026-02)
                </label>
                <input className="input w-full" placeholder="YYYY-MM"
                  value={form.period}
                  onChange={e => setForm(p => ({ ...p, period: e.target.value }))} />
              </div>
              <button className="btn w-full" onClick={handleSaveTarget}
                disabled={saving || !form.userId || !form.target || !form.period}>
                {saving ? "Saving..." : "Save Target"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
