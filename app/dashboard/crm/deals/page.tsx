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
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">Sales Pipeline</h1>

      {pipelines.length > 1 && (
        <div className="mb-4 flex gap-2">
          {pipelines.map((pipeline) => (
            <button
              key={pipeline.id}
              className={`rounded px-4 py-2 text-sm ${activePipeline === pipeline.id ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
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
