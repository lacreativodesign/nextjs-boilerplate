"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsDarkMode } from "@/lib/useIsDarkMode";
import { formatUsd, formatDate } from "@/components/finance/financeUtils";

const PIPELINE_STAGES = [
  "New Lead",
  "Contacted",
  "Qualified",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

type DealRecord = {
  id: string;
  dealName: string;
  clientName: string;
  stage: string;
  valueUsd: number;
  probability: number;
  ownerName: string | null;
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  expectedCloseDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type PipelineResponse = { ok: boolean; deals: DealRecord[] };

type ErrorState = { title: string; message: string };

export default function SalesManagerPipelinePage() {
  const isDark = useIsDarkMode();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/sales-manager/pipeline/list", { cache: "no-store" });
        const json = (await res.json()) as PipelineResponse;
        if (!res.ok || !json.ok) {
          throw new Error(json?.ok ? "" : "Failed to load pipeline");
        }
        if (!alive) return;
        setDeals(Array.isArray(json.deals) ? json.deals : []);
      } catch (err: any) {
        if (!alive) return;
        setError({
          title: "Unable to load pipeline",
          message: err?.message || "Please try again later.",
        });
        setDeals([]);
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

  const stages = useMemo(() => PIPELINE_STAGES, []);
  const columnTemplate = useMemo(() => `repeat(${stages.length}, minmax(260px, 1fr))`, [stages.length]);

  const dealsByStage = useMemo(() => {
    const map: Record<string, DealRecord[]> = {};
    stages.forEach((stage) => {
      map[stage] = [];
    });
    deals.forEach((deal) => {
      const stage = stages.includes(deal.stage) ? deal.stage : "New Lead";
      map[stage] = map[stage] || [];
      map[stage].push(deal);
    });
    return map;
  }, [deals, stages]);

  const handleDragStart = (deal: DealRecord, event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", JSON.stringify({ id: deal.id, from: deal.stage }));
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (stage: string, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOverStage(null);

    try {
      const payload = JSON.parse(event.dataTransfer.getData("text/plain"));
      const dealId = payload?.id as string;
      if (!dealId || stage === payload?.from) return;
      setMovingId(dealId);

      setDeals((prev) => prev.map((deal) => (deal.id === dealId ? { ...deal, stage } : deal)));

      const res = await fetch("/api/sales-manager/pipeline/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dealId, stage }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Unable to move deal.");
      }
    } catch (err) {
      console.error("Pipeline update failed", err);
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Drag deals across stages to reflect live sales momentum. All moves are permission-checked.
          </p>
        </div>
      </div>

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

      <div className="card" style={{ padding: 12 }}>
        {loading ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            Loading pipeline...
          </p>
        ) : deals.length === 0 ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            No deals in pipeline.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: columnTemplate,
                gap: 14,
                minWidth: 260 * stages.length,
              }}
            >
              {stages.map((stage) => {
                const stageDeals = dealsByStage[stage] || [];
                const isActiveDrop = dragOverStage === stage;

                return (
                  <div
                    key={stage}
                    className="card"
                    style={{
                      padding: 12,
                      borderRadius: 16,
                      minHeight: 220,
                      border: isActiveDrop ? "1px dashed var(--erp-blue)" : "1px solid var(--border-subtle)",
                      background: isActiveDrop ? "var(--surface-muted)" : "var(--surface-card)",
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverStage(stage);
                    }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(event) => handleDrop(stage, event)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ fontWeight: 700 }}>{stage}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{stageDeals.length} deals</div>
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      {stageDeals.map((deal) => (
                        <div
                          key={deal.id}
                          className="card"
                          draggable
                          onDragStart={(event) => handleDragStart(deal, event)}
                          style={{
                            padding: 12,
                            borderRadius: 14,
                            cursor: movingId === deal.id ? "progress" : "grab",
                          }}
                        >
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>{deal.dealName || "Unnamed Deal"}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{deal.clientName || "Unknown client"}</div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 8 }}>
                            <span>{deal.ownerName || "Unassigned"}</span>
                            <span style={{ fontWeight: 600 }}>{formatUsd(deal.valueUsd)}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                            Expected close {formatDate(deal.expectedCloseDate)} · {deal.probability}%
                          </div>
                        </div>
                      ))}
                      {stageDeals.length === 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Drop deals here</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
