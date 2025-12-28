"use client";

import type { DragEvent } from "react";
import { PIPELINE_STAGES, getInitials } from "@/lib/sales/utils";

export type PipelineDeal = {
  id: string;
  dealName: string;
  clientName: string;
  stage: string;
  valueUsd: number;
  probability: number;
  ownerName?: string | null;
};

type PipelineKanbanProps = {
  deals: PipelineDeal[];
  onStageChange: (deal: PipelineDeal, stage: string) => void;
  onCardClick: (deal: PipelineDeal) => void;
  isDark: boolean;
};

export default function PipelineKanban({ deals, onStageChange, onCardClick, isDark }: PipelineKanbanProps) {
  const stages = PIPELINE_STAGES;

  const handleDrop = (event: DragEvent<HTMLDivElement>, stage: string) => {
    event.preventDefault();
    const dealId = event.dataTransfer.getData("dealId");
    const deal = deals.find((item) => item.id === dealId);
    if (deal && deal.stage !== stage) {
      onStageChange(deal, stage);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
      {stages.map((stage) => {
        const items = deals.filter((deal) => deal.stage === stage);
        return (
          <div
            key={stage}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, stage)}
            className="card"
            style={{ padding: 14, borderRadius: 18, minHeight: 260 }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {stage}
            </div>
            <div style={{ height: 10 }} />
            <div style={{ display: "grid", gap: 10 }}>
              {items.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>No deals</div>}
              {items.map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("dealId", deal.id)}
                  onClick={() => onCardClick(deal)}
                  className="card"
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    cursor: "pointer",
                    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{deal.dealName}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{deal.clientName}</div>
                  <div style={{ height: 10 }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8 }}>
                    <span>${deal.valueUsd.toLocaleString()}</span>
                    <span>{deal.probability}%</span>
                  </div>
                  <div style={{ height: 10 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        background: isDark ? "rgba(148,163,184,0.2)" : "rgba(59,130,246,0.12)",
                        color: isDark ? "#e2e8f0" : "#1e3a8a",
                        fontSize: 11,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                      }}
                    >
                      {getInitials(deal.ownerName || "")}
                    </div>
                    <span style={{ fontSize: 12, opacity: 0.75 }}>{deal.ownerName || "Unassigned"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
