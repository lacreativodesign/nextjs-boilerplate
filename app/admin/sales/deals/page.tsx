"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import SalesDrawer from "@/components/sales/SalesDrawer";
import { formatDate, formatDateTime, formatUsd } from "@/components/finance/financeUtils";
import { PIPELINE_STAGES, toInputDate } from "@/lib/sales/utils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

const STAGE_OPTIONS = [{ label: "All Stages", value: "" }, ...PIPELINE_STAGES.map((stage) => ({ label: stage, value: stage }))];

type DealRecord = {
  id: string;
  dealName: string;
  clientName: string;
  leadName?: string;
  stage: string;
  valueUsd: number;
  probability: number;
  ownerId?: string | null;
  ownerName?: string | null;
  expectedCloseDate?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  paymentStatus?: string | null;
  projectId?: string | null;
  projectCreated?: boolean;
};

type UserOption = { uid: string; name?: string; fullName?: string; role?: string };

type ErrorState = { title: string; message: string };

type DealFormState = {
  id?: string;
  dealName: string;
  clientName: string;
  stage: string;
  valueUsd: number;
  probability: number;
  ownerId: string;
  ownerName: string;
  expectedCloseDate: string;
};

const defaultForm: DealFormState = {
  dealName: "",
  clientName: "",
  stage: PIPELINE_STAGES[0],
  valueUsd: 0,
  probability: 10,
  ownerId: "",
  ownerName: "",
  expectedCloseDate: "",
};

export default function SalesDealsPage() {
  const isDark = useIsDarkMode();
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [owners, setOwners] = useState<UserOption[]>([]);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<DealFormState>(defaultForm);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const selectedDeal = useMemo(
    () => (form.id ? deals.find((deal) => deal.id === form.id) || null : null),
    [deals, form.id]
  );

  const loadDeals = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/admin/sales/deals/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load deals.");
      }
      setDeals(data.deals || []);
    } catch (err) {
      console.error("Deals load error", err);
      setError({ title: "Unable to load deals", message: "Please try again in a moment." });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOwners = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users/list", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setOwners(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Owners load error", err);
    }
  }, []);

  useEffect(() => {
    loadDeals();
    loadOwners();
  }, [loadDeals, loadOwners]);

  const ownerOptions = useMemo(
    () => [
      { label: "All Owners", value: "" },
      ...owners.map((owner) => ({ label: owner.name || owner.fullName || owner.uid, value: owner.uid })),
    ],
    [owners]
  );

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deals.filter((deal) => {
      if (stageFilter && deal.stage !== stageFilter) return false;
      if (ownerFilter && deal.ownerId !== ownerFilter) return false;
      if (q) {
        const hay = [deal.dealName, deal.clientName, deal.ownerName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deals, query, stageFilter, ownerFilter]);

  const openCreate = () => {
    setDrawerMode("create");
    setForm(defaultForm);
    setDrawerOpen(true);
  };

  const openEdit = (deal: DealRecord) => {
    setDrawerMode("edit");
    setForm({
      id: deal.id,
      dealName: deal.dealName,
      clientName: deal.clientName,
      stage: deal.stage,
      valueUsd: deal.valueUsd,
      probability: deal.probability,
      ownerId: deal.ownerId || "",
      ownerName: deal.ownerName || "",
      expectedCloseDate: toInputDate(deal.expectedCloseDate),
    });
    setDrawerOpen(true);
  };

  const handleOwnerChange = (ownerId: string) => {
    const owner = owners.find((item) => item.uid === ownerId);
    setForm((prev) => ({
      ...prev,
      ownerId,
      ownerName: owner?.name || owner?.fullName || "",
    }));
  };

  const handleSave = async () => {
    try {
      setActionLoading("save");
      const endpoint = drawerMode === "create" ? "/api/admin/sales/deals/create" : "/api/admin/sales/deals/update";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          expectedCloseDate: form.expectedCloseDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to save deal.");
      }
      setDrawerOpen(false);
      await loadDeals();
    } catch (err) {
      console.error("Deal save error", err);
      setError({ title: "Unable to save deal", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (deal: DealRecord) => {
    try {
      setActionLoading(deal.id);
      const res = await fetch("/api/admin/sales/deals/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deal.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to delete deal.");
      }
      await loadDeals();
    } catch (err) {
      console.error("Deal delete error", err);
      setError({ title: "Unable to delete deal", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  const markClosed = async (deal: DealRecord, status: "Closed Won" | "Closed Lost") => {
    try {
      setActionLoading(`${deal.id}-${status}`);
      const res = await fetch("/api/admin/sales/deals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deal.id, stage: status }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to update deal.");
      }
      await loadDeals();
    } catch (err) {
      console.error("Deal close error", err);
      setError({ title: "Unable to update deal", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDrawerClosedWon = () => {
    if (!form.id) return;
    const deal = deals.find((item) => item.id === form.id);
    if (deal) {
      markClosed(deal, "Closed Won");
    }
  };

  const handleMarkPaid = async (deal: DealRecord) => {
    try {
      const actionKey = `mark-paid-${deal.id}`;
      setActionLoading(actionKey);
      const res = await fetch("/api/deals/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deal.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to mark deal paid.");
      }
      await loadDeals();
    } catch (err) {
      console.error("Deal mark paid error", err);
      setError({ title: "Unable to mark paid", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div
          className="card"
          style={{
            borderRadius: 14,
            padding: 16,
            border: "1px solid rgba(239,68,68,0.35)",
            background: isDark ? "rgba(127,29,29,0.2)" : "rgba(254,226,226,0.6)",
            color: isDark ? "#fecaca" : "#991b1b",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700 }}>{error.title}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>{error.message}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Deals</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            Manage deal values, probabilities, and closing actions.
          </p>
        </div>
        <button className="btn" onClick={openCreate} style={{ borderRadius: 999 }}>
          Create Deal
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          className="input"
          placeholder="Search keyword"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <MasterSelect value={stageFilter} onChange={(value) => setStageFilter(value)} options={STAGE_OPTIONS} />
        <MasterSelect value={ownerFilter} onChange={(value) => setOwnerFilter(value)} options={ownerOptions} />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setQuery("");
            setStageFilter("");
            setOwnerFilter("");
          }}
          style={{ borderRadius: 999, padding: "10px 16px", fontWeight: 500 }}
        >
          Reset Filters
        </button>
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
          padding: 0,
          borderRadius: 18,
          background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.95)",
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
          boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.35)" : "0 18px 40px rgba(15,23,42,0.08)",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
            <thead>
              <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>Deal Name</th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>Client / Lead</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Stage</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Value (USD)</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Probability %</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Owner</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Expected Close Date</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Updated At</th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: 24, textAlign: "center" }}>
                    Loading deals...
                  </td>
                </tr>
              ) : filteredDeals.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 24, textAlign: "center" }}>
                    No deals found.
                  </td>
                </tr>
              ) : (
                filteredDeals.map((deal) => (
                  <tr key={deal.id} style={{ borderTop: isDark ? "1px solid rgba(148,163,184,0.15)" : "1px solid #e2e8f0" }}>
                    <td style={{ padding: "14px 16px", fontWeight: 600 }}>{deal.dealName}</td>
                    <td style={{ padding: "14px 16px" }}>{deal.clientName || deal.leadName || "-"}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{deal.stage}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{formatUsd(deal.valueUsd)}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{deal.probability}%</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{deal.ownerName || "Unassigned"}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{formatDate(deal.expectedCloseDate)}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{formatDateTime(deal.updatedAt)}</td>
                    <td style={{ padding: "14px 16px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => openEdit(deal)}
                          style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => markClosed(deal, "Closed Won")}
                          disabled={actionLoading === `${deal.id}-Closed Won`}
                          style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                        >
                          {actionLoading === `${deal.id}-Closed Won` ? "Processing" : "Closed Won"}
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => markClosed(deal, "Closed Lost")}
                          disabled={actionLoading === `${deal.id}-Closed Lost`}
                          style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                        >
                          {actionLoading === `${deal.id}-Closed Lost` ? "Processing" : "Closed Lost"}
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => handleDelete(deal)}
                          disabled={actionLoading === deal.id}
                          style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                        >
                          {actionLoading === deal.id ? "Deleting" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <SalesDrawer
          title={drawerMode === "create" ? "Create Deal" : "Deal Details"}
          subtitle={drawerMode === "create" ? "Add a new deal" : formatDateTime(form.id ? deals.find((d) => d.id === form.id)?.updatedAt : null)}
          onClose={() => setDrawerOpen(false)}
          isDark={isDark}
          actions={
            <>
              <button className="btn" onClick={handleSave} disabled={actionLoading === "save"} style={{ borderRadius: 999 }}>
                {actionLoading === "save" ? "Saving" : "Save Deal"}
              </button>
              {drawerMode === "edit" && form.id && (
                <button className="btn" onClick={handleDrawerClosedWon} style={{ borderRadius: 999 }}>
                  Mark Closed Won
                </button>
              )}
              {drawerMode === "edit" && selectedDeal && (
                <button
                  className="btn"
                  onClick={() => handleMarkPaid(selectedDeal)}
                  disabled={
                    Boolean(selectedDeal.projectCreated || selectedDeal.projectId) ||
                    actionLoading === `mark-paid-${selectedDeal.id}`
                  }
                  style={{ borderRadius: 999 }}
                >
                  {actionLoading === `mark-paid-${selectedDeal.id}` ? "Processing" : "Mark Paid"}
                </button>
              )}
            </>
          }
        >
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Deal Details</div>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Deal Name</span>
                <input
                  className="input"
                  placeholder="Deal name"
                  value={form.dealName}
                  onChange={(e) => setForm((prev) => ({ ...prev, dealName: e.target.value }))}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Client / Lead</span>
                <input
                  className="input"
                  placeholder="Client name"
                  value={form.clientName}
                  onChange={(e) => setForm((prev) => ({ ...prev, clientName: e.target.value }))}
                />
              </label>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Stage</span>
                <MasterSelect
                  value={form.stage}
                  onChange={(value) => setForm((prev) => ({ ...prev, stage: value }))}
                  options={PIPELINE_STAGES.map((stage) => ({ label: stage, value: stage }))}
                />
              </div>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Value (USD)</span>
                <input
                  className="input"
                  type="number"
                  value={form.valueUsd}
                  onChange={(e) => setForm((prev) => ({ ...prev, valueUsd: Number(e.target.value) }))}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Probability %</span>
                <input
                  className="input"
                  type="number"
                  value={form.probability}
                  onChange={(e) => setForm((prev) => ({ ...prev, probability: Number(e.target.value) }))}
                />
              </label>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Owner</span>
                <MasterSelect value={form.ownerId} onChange={handleOwnerChange} options={ownerOptions} />
              </div>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Expected Close Date</span>
                <input
                  className="input"
                  type="date"
                  value={form.expectedCloseDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, expectedCloseDate: e.target.value }))}
                />
              </label>
            </div>
          </div>
          {drawerMode === "edit" && selectedDeal && (
            <div className="card" style={{ padding: 16, borderRadius: 14, marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>Project Automation</div>
                {(selectedDeal.projectCreated || selectedDeal.projectId) && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(34,197,94,0.12)",
                      color: "#15803d",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Project Created
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Payment Status</span>
                  <span style={{ fontWeight: 700 }}>{selectedDeal.paymentStatus || "Unpaid"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Project ID</span>
                  <span style={{ fontWeight: 700 }}>{selectedDeal.projectId || "—"}</span>
                </div>
              </div>
            </div>
          )}
        </SalesDrawer>
      )}
    </div>
  );
}
