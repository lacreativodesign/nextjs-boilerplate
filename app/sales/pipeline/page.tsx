"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SalesDrawer from "@/components/sales/SalesDrawer";
import PipelineKanban, { type PipelineDeal } from "@/components/sales/PipelineKanban";
import { PIPELINE_STAGES } from "@/lib/sales/utils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";
import { formatDate } from "@/components/finance/financeUtils";

const STAGE_OPTIONS = ["All", ...PIPELINE_STAGES];

type PipelineResponse = { ok: boolean; deals: PipelineDeal[] };

type ErrorState = { title: string; message: string };

export default function SalesPipelinePage() {
  const isDark = useIsDarkMode();
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [selected, setSelected] = useState<PipelineDeal | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadDeals = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/sales/pipeline", { cache: "no-store", credentials: "include" });
      const data = (await res.json()) as PipelineResponse;
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

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...deals];
    if (stageFilter !== "All") {
      list = list.filter((deal) => deal.stage === stageFilter);
    }
    if (q) {
      list = list.filter((deal) => {
        const hay = [deal.dealName, deal.clientName, deal.ownerName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [deals, query, stageFilter]);

  const handleStageChange = async (deal: PipelineDeal, stage: string) => {
    const nextStage = stage === "New" ? "New Lead" : stage;
    try {
      setUpdatingId(deal.id);
      const res = await fetch("/api/sales/leads/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: deal.leadId || deal.id, stage: nextStage }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to update stage.");
      }
      setDeals((prev) => prev.map((item) => (item.id === deal.id ? { ...item, stage: nextStage } : item)));
    } catch (err) {
      console.error("Pipeline stage update error", err);
      setError({ title: "Unable to update stage", message: "Please try again." });
    } finally {
      setUpdatingId(null);
    }
  };

  const openDrawer = (deal: PipelineDeal) => {
    setSelected(deal);
    setDrawerOpen(true);
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
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Pipeline</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            Move deals across stages to keep your pipeline accurate.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 18, borderRadius: 18 }}>
        <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
          <div>
            <label className="text-xs font-semibold text-slate-500">Search</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search keyword"
              className="input mt-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Stage</label>
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="input mt-2"
            >
              {STAGE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {stage === "All" ? "All stages" : stage}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <div className="card" style={{ padding: 24, borderRadius: 18 }}>
            Loading pipeline...
          </div>
        ) : (
          <PipelineKanban
            deals={filteredDeals.map((deal) => ({
              ...deal,
              stage: deal.stage || "New Lead",
              dealName: deal.dealName || deal.clientName || "Untitled Deal",
              clientName: deal.clientName || "-",
              valueUsd: deal.valueUsd || 0,
              probability: deal.probability || 0,
            }))}
            onStageChange={handleStageChange}
            onCardClick={openDrawer}
            isDark={isDark}
          />
        )}
      </div>

      {drawerOpen && selected && (
        <SalesDrawer
          title={selected.dealName || "Deal details"}
          subtitle="Pipeline details"
          onClose={() => setDrawerOpen(false)}
        >
          <div className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Client</span>
              <span>{selected.clientName || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Stage</span>
              <span>{selected.stage}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Value</span>
              <span>${Number(selected.valueUsd || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Probability</span>
              <span>{selected.probability}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Owner</span>
              <span>{selected.ownerName || "Unassigned"}</span>
            </div>
            {selected.updatedAt && (
              <div className="flex justify-between">
                <span className="text-slate-500">Updated</span>
                <span>{formatDate(selected.updatedAt)}</span>
              </div>
            )}
            {updatingId === selected.id && <div className="text-xs text-slate-500">Updating stage...</div>}
          </div>
        </SalesDrawer>
      )}
    </div>
  );
}
