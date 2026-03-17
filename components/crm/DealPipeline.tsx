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
          <section key={stage} className="card p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase text-[var(--text-muted)]">{stage}</h3>
            <div className="space-y-2">
              {stageDeals.map((deal) => (
                <div key={deal.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 text-sm">
                  <p className="font-medium text-[var(--text-primary)]">{deal.name || deal.title}</p>
                  <p className="text-[var(--text-muted)]">${(deal.value || deal.valueUSD || 0).toLocaleString()}</p>
                </div>
              ))}
              {stageDeals.length === 0 && <p className="text-xs text-[var(--text-soft)]">No deals</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
