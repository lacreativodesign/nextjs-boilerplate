"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "../ui/Skeleton";

type ApprovalItem = {
  id: string;
  tenantId: string;
  type: "discount" | "change_request" | "production_override";
  title: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  requestedBy?: { uid?: string; role?: string } | null;
  entityType: string;
  entityId: string;
  requestedData: Record<string, unknown>;
};

type ApprovalsResponse = {
  ok: boolean;
  approvals: ApprovalItem[];
};

type ApprovalsPageProps = {
  title: string;
  subtitle: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function ApprovalsPage({ title, subtitle }: ApprovalsPageProps) {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApprovalItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadApprovals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/approvals/pending", { cache: "no-store" });
      const data = (await res.json()) as ApprovalsResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load approvals.");
      }
      setApprovals(Array.isArray(data.approvals) ? data.approvals : []);
    } catch (err) {
      console.error("Approvals fetch error", err);
      setError((err instanceof Error ? err.message : undefined) || "Unable to load approvals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  const pendingCount = useMemo(
    () => approvals.filter((item) => item.status === "pending").length,
    [approvals]
  );

  const resolveApproval = async (item: ApprovalItem, action: "approve" | "reject") => {
    try {
      setActionLoading(true);
      const res = await fetch(action === "approve" ? "/api/approvals/approve" : "/api/approvals/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Unable to resolve approval.");
      }
      setSelected(null);
      loadApprovals();
    } catch (err) {
      console.error("Approval resolve error", err);
      setError((err instanceof Error ? err.message : undefined) || "Unable to resolve approval.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            {subtitle}
          </p>
        </div>
        <button className="btn" onClick={loadApprovals} style={{ borderRadius: 999 }}>
          Refresh
        </button>
      </div>

      <div className="kpis">
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>Pending approvals</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{pendingCount}</div>
        </div>
      </div>

      <div className="table-shell" style={{ marginTop: 18 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 780 }}>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Title</th>
                <th>Requested</th>
                <th>Requested By</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={`approval-skeleton-${index}`}>
                    <td colSpan={6}>
                      <div className="grid grid-cols-6 gap-4 py-2">
                        {Array.from({ length: 6 }).map((__, col) => (
                          <Skeleton key={`approval-skeleton-${index}-${col}`} variant="text" className="h-4 w-full" />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && approvals.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-sm text-[var(--text-muted)]">
                    No approvals pending.
                  </td>
                </tr>
              )}
              {!loading &&
                approvals.map((item) => (
                  <tr key={`${item.type}-${item.id}`}>
                    <td>{item.type.replace("_", " ")}</td>
                    <td>{item.title || "—"}</td>
                    <td>{formatDate(item.requestedAt)}</td>
                    <td>{item.requestedBy?.uid || item.requestedBy?.role || "—"}</td>
                    <td>{item.status}</td>
                    <td>
                      <button className="btn ghost" onClick={() => setSelected(item)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {error && <div className="text-sm text-red-500" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {selected && (
        <div className="drawer-overlay" onClick={() => setSelected(null)}>
          <div className="drawer-panel drawer-panel--md" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-title">Approval details</div>
            <div className="drawer-subtitle" style={{ marginTop: 4 }}>
              {selected.type.replace("_", " ")}
            </div>
            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Title</div>
                <div>{selected.title || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Requested</div>
                <div>{formatDate(selected.requestedAt)}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Requested by</div>
                <div>{selected.requestedBy?.uid || selected.requestedBy?.role || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Entity</div>
                <div>
                  {selected.entityType} · {selected.entityId}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Details</div>
                {Object.keys(selected.requestedData || {}).length === 0 ? (
                  <div className="text-sm text-[var(--text-muted)]">No additional details.</div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(selected.requestedData).map(([key, value]) => (
                      <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span className="text-xs text-[var(--text-muted)]">{key}</span>
                        <span className="text-sm">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button className="btn" disabled={actionLoading} onClick={() => resolveApproval(selected, "approve")}>
                  Approve
                </button>
                <button className="btn btn-danger" disabled={actionLoading} onClick={() => resolveApproval(selected, "reject")}>
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
