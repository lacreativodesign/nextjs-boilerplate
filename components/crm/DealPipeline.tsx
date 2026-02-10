"use client";

type Deal = {
  id: string;
  title?: string;
  name?: string;
  stage: string;
  valueUSD?: number;
  value?: number;
};

type DealPipelineProps = {
  pipelineId: string;
  deals: Deal[];
  onUpdate: () => Promise<void> | void;
};

const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];

export function DealPipeline({ deals }: DealPipelineProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      {STAGES.map((stage) => {
        const stageDeals = deals.filter((deal) => deal.stage === stage);
        return (
          <section key={stage} className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase text-gray-700">{stage}</h3>
            <div className="space-y-2">
              {stageDeals.map((deal) => (
                <div key={deal.id} className="rounded border border-gray-100 bg-gray-50 p-3 text-sm">
                  <p className="font-medium text-gray-900">{deal.name || deal.title}</p>
                  <p className="text-gray-600">${(deal.value || deal.valueUSD || 0).toLocaleString()}</p>
                </div>
              ))}
              {stageDeals.length === 0 && <p className="text-xs text-gray-400">No deals</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
