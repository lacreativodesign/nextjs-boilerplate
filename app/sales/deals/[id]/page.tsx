"use client";

import { useEffect, useState } from "react";

const STAGES = ["new", "contacted", "qualified", "proposal_sent", "negotiation", "closed_won", "closed_lost"];

export default function SalesDealDetailPage({ params }: { params: { id: string } }) {
  const [deal, setDeal] = useState<any>(null);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [reason, setReason] = useState("");

  async function loadDeal() {
    const res = await fetch(`/api/crm/deals/${params.id}`, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setDeal(data.deal);
  }

  useEffect(() => {
    loadDeal();
  }, [params.id]);

  async function updateStage(stage: string) {
    const res = await fetch(`/api/crm/deals/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || "Failed to update stage");
      return;
    }
    await loadDeal();
  }

  async function requestDiscount() {
    const res = await fetch(`/api/crm/deals/${params.id}/discount-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discountPercent, reason }),
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || "Failed to request discount");
      return;
    }
    alert(data.autoApproved ? "Discount auto-approved" : "Discount request sent to manager");
    await loadDeal();
  }

  if (!deal) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Deal Detail</h1>
      <div className="card p-4">
        <div>Title: {deal.title}</div>
        <div>Value (USD): ${Number(deal.valueUSD || 0).toLocaleString()}</div>
        <div>Discount: {deal.discountPercent || 0}% ({deal.discountApproved ? "approved" : "pending"})</div>
      </div>

      <div className="card p-4">
        <label className="mb-1 block">Stage</label>
        <select className="input" value={deal.stage} onChange={(e) => updateStage(e.target.value)}>
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>{stage}</option>
          ))}
        </select>
      </div>

      <div className="card space-y-2 p-4">
        <h2 className="font-semibold">Discount Request</h2>
        <input
          className="input"
          type="number"
          value={discountPercent}
          onChange={(e) => setDiscountPercent(Number(e.target.value))}
          placeholder="Discount %"
        />
        <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        <button className="btn" onClick={requestDiscount}>Submit discount request</button>
      </div>
    </div>
  );
}
