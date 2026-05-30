"use client";

import { useEffect, useState } from "react";

export default function SalesManagerDealDetailPage({ params }: { params: { id: string } }) {
  const [deal, setDeal] = useState<unknown>(null);
  const [requests, setRequests] = useState<unknown[]>([]);

  async function load() {
    const [dealRes, reqRes] = await Promise.all([
      fetch(`/api/crm/deals/${params.id}`, { cache: "no-store" }),
      fetch(`/api/crm/discount-requests?dealId=${params.id}`, { cache: "no-store" }),
    ]);

    const dealData = await dealRes.json();
    const reqData = await reqRes.json();
    if (dealData.ok) setDeal(dealData.deal);
    if (reqData.ok) setRequests(reqData.requests || []);
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function review(id: string, decision: "approved" | "rejected") {
    const res = await fetch(`/api/crm/discount-requests/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || "Failed to review");
      return;
    }
    await load();
  }

  if (!deal) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Deal Review</h1>
      <div className="card p-4">
        <div>Title: {String((deal as Record<string, unknown>).title || "")}</div>
        <div>Stage: {String((deal as Record<string, unknown>).stage || "")}</div>
        <div>Value: ${Number((deal as Record<string, unknown>).valueUSD || 0).toLocaleString()}</div>
        <div>Discount Approved: {(deal as Record<string, unknown>).discountApproved ? "Yes" : "No"}</div>
      </div>

      <div className="card p-4">
        <h2 className="mb-2 font-semibold">Discount Requests</h2>
        {requests.length === 0 && <div>No discount requests.</div>}
        {requests.map((request) => (
          <div key={String((request as Record<string, unknown>).id || "")} className="mb-2 rounded border p-2">
            <div>{String((request as Record<string, unknown>).discountPercent || "")}% - {String((request as Record<string, unknown>).reason || "")}</div>
            <div>Status: {String((request as Record<string, unknown>).status || "")}</div>
            {(request as Record<string, unknown>).status === "pending" && (
              <div className="mt-2 flex gap-2">
                <button className="btn" onClick={() => review(String((request as Record<string, unknown>).id || ""), "approved")}>Approve</button>
                <button className="btn" onClick={() => review(String((request as Record<string, unknown>).id || ""), "rejected")}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
