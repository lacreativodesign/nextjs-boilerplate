"use client";

import { useEffect, useState } from "react";
import { DealPipeline } from "@/components/crm/DealPipeline";

type Deal = {
  id: string;
  title?: string;
  name?: string;
  stage: string;
  valueUSD?: number;
  value?: number;
};

type Pipeline = {
  id: string;
  name: string;
};

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipeline, setActivePipeline] = useState<string | null>(null);

  useEffect(() => {
    void fetchPipelines();
    void fetchDeals();
  }, []);

  const fetchPipelines = async () => {
    const response = await fetch("/api/crm/pipelines", { cache: "no-store" });
    const data = await response.json();
    setPipelines(data.pipelines || []);
    if (data.pipelines?.length > 0) {
      setActivePipeline(data.pipelines[0].id);
    }
  };

  const fetchDeals = async () => {
    const response = await fetch("/api/crm/deals", { cache: "no-store" });
    const data = await response.json();
    setDeals(data.deals || []);
  };

  return (
    <div className="page-frame">
      <h1 className="mb-6 text-2xl font-bold">Sales Pipeline</h1>

      {pipelines.length > 1 && (
        <div className="mb-4 flex gap-2">
          {pipelines.map((pipeline) => (
            <button
              key={pipeline.id}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${activePipeline === pipeline.id ? "bg-[var(--erp-blue)] text-white" : "bg-[var(--surface-muted)] text-[var(--text-primary)]"}`}
              onClick={() => setActivePipeline(pipeline.id)}
            >
              {pipeline.name}
            </button>
          ))}
        </div>
      )}

      {activePipeline && <DealPipeline pipelineId={activePipeline} deals={deals} onUpdate={fetchDeals} />}
    </div>
  );
}
