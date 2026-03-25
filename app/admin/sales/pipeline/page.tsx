"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PipelineKanban, { PipelineDeal } from "@/components/sales/PipelineKanban";
import SalesDrawer from "@/components/sales/SalesDrawer";
import MasterSelect from "@/components/ui/MasterSelect";
import { formatDate, formatDateTime, formatUsd } from "@/components/finance/financeUtils";
import { PIPELINE_STAGES } from "@/lib/sales/utils";

const STAGE_OPTIONS = PIPELINE_STAGES.map((stage) => ({ label: stage, value: stage }));

type DealRecord = PipelineDeal & {
  leadName?: string;
  leadEmail?: string;
  leadPhone?: string;
  expectedCloseDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type ErrorState = { title: string; message: string };

export default function SalesPipelinePage() {
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<DealRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadDeals = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/admin/sales/pipeline/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load pipeline.");
      }
      setDeals(data.deals || []);
    } catch (err) {
      console.error("Pipeline load error", err);
      setError({ title: "Unable to load pipeline", message: "Please try again in a moment." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  const pipelineDeals = useMemo(() => deals.map((deal) => ({ ...deal, valueUsd: deal.valueUsd || 0 })), [deals]);

  const openDeal = (deal: DealRecord) => {
    setSelectedDeal(deal);
    setDrawerOpen(true);
  };

  const handleStageChange = async (deal: DealRecord, stage: string) => {
    try {
      setActionLoading(deal.id);
      const endpoint =
        stage === "Closed Won" || stage === "Closed Lost"
          ? "/api/admin/sales/deals/update"
          : "/api/admin/sales/pipeline/update";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deal.id, stage }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to update stage.");
      }
      await loadDeals();
    } catch (err) {
      console.error("Stage update error", err);
      setError({ title: "Unable to update stage", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleFieldUpdate = async () => {
    if (!selectedDeal) return;
    try {
      setActionLoading("update");
      const res = await fetch("/api/admin/sales/deals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedDeal.id,
          stage: selectedDeal.stage,
          valueUsd: selectedDeal.valueUsd,
          probability: selectedDeal.probability,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to update deal.");
      }
      await loadDeals();
      setDrawerOpen(false);
    } catch (err) {
      console.error("Deal update error", err);
      setError({ title: "Unable to update deal", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  const markClosed = async (status: "Closed Won" | "Closed Lost") => {
    if (!selectedDeal) return;
    try {
      setActionLoading(status);
      const res = await fetch("/api/admin/sales/deals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedDeal.id, stage: status }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to update deal.");
      }
      await loadDeals();
      setDrawerOpen(false);
    } catch (err) {
      console.error("Deal close error", err);
      setError({ title: "Unable to update deal", message: "Please try again." });
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
            background: "var(--danger-soft)",
            color: "var(--danger)",
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
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Pipeline</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            Drag deals across stages to keep the pipeline in sync.
          </p>
        </div>
        <button className="btn" onClick={loadDeals} style={{ borderRadius: 999 }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ marginTop: 18, padding: 20, borderRadius: 18 }}>
          Loading pipeline...
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <PipelineKanban
            deals={pipelineDeals}
            onStageChange={handleStageChange}
            onCardClick={(deal) => openDeal(deal as DealRecord)}
           
          />
        </div>
      )}

      {drawerOpen && selectedDeal && (
        <SalesDrawer
          title={selectedDeal.dealName}
          subtitle={selectedDeal.clientName}
          onClose={() => setDrawerOpen(false)}
         
          actions={
            <>
              <button className="btn" onClick={handleFieldUpdate} disabled={actionLoading === "update"} style={{ borderRadius: 999 }}>
                {actionLoading === "update" ? "Saving" : "Save Changes"}
              </button>
              <button
                className="btn"
                onClick={() => markClosed("Closed Won")}
                disabled={actionLoading === "Closed Won"}
                style={{ borderRadius: 999 }}
              >
                {actionLoading === "Closed Won" ? "Processing" : "Mark Closed Won"}
              </button>
              <button
                className="btn ghost"
                onClick={() => markClosed("Closed Lost")}
                disabled={actionLoading === "Closed Lost"}
                style={{ borderRadius: 999 }}
              >
                {actionLoading === "Closed Lost" ? "Processing" : "Mark Closed Lost"}
              </button>
            </>
          }
        >
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Deal Summary</div>
            <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
              <SummaryRow label="Stage" value={selectedDeal.stage} />
              <SummaryRow label="Value" value={formatUsd(selectedDeal.valueUsd)} />
              <SummaryRow label="Probability" value={`${selectedDeal.probability}%`} />
              <SummaryRow label="Expected Close" value={formatDate(selectedDeal.expectedCloseDate)} />
              <SummaryRow label="Updated" value={formatDateTime(selectedDeal.updatedAt)} />
            </div>
          </div>

          <div style={{ height: 16 }} />

          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Update Deal</div>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Stage</span>
                <MasterSelect
                  value={selectedDeal.stage}
                  onChange={(value) => setSelectedDeal((prev) => (prev ? { ...prev, stage: value } : prev))}
                  options={STAGE_OPTIONS}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Value (USD)</span>
                <input
                  className="input"
                  type="number"
                  value={selectedDeal.valueUsd}
                  onChange={(e) => setSelectedDeal((prev) => (prev ? { ...prev, valueUsd: Number(e.target.value) } : prev))}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Probability %</span>
                <input
                  className="input"
                  type="number"
                  value={selectedDeal.probability}
                  onChange={(e) =>
                    setSelectedDeal((prev) => (prev ? { ...prev, probability: Number(e.target.value) } : prev))
                  }
                />
              </label>
            </div>
          </div>
        </SalesDrawer>
      )}

      {actionLoading && actionLoading !== "update" && actionLoading !== "Closed Won" && actionLoading !== "Closed Lost" && (
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>Updating pipeline...</div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
