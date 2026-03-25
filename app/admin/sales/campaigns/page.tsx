"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUsd } from "@/components/finance/financeUtils";

const toPercent = (value: number) => `${Number(value || 0).toFixed(1)}%`;

type CampaignRecord = {
  id: string;
  name: string;
  channel: string;
  leadsCount: number;
  dealsCount: number;
  revenueUsd: number;
  conversionRate: number;
};

type ErrorState = { title: string; message: string };

export default function SalesCampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState("");

  const loadCampaigns = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/admin/sales/campaigns/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load campaigns.");
      }
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error("Campaigns load error", err);
      setError({ title: "Unable to load campaigns", message: "Please try again in a moment." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const filteredCampaigns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((item) => {
      const hay = [item.name, item.channel].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [campaigns, query]);

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
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Sources & Campaigns</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            Attribution snapshot for lead sources and marketing performance.
          </p>
        </div>
        <button className="btn" onClick={loadCampaigns} style={{ borderRadius: 999 }}>
          Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          className="input"
          placeholder="Search keyword"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 220 }}
        />
      </div>

      <div className="table-shell">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
            <thead>
              <tr style={{ background: "var(--surface-muted)" }}>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>Source / Campaign</th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>Channel</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Leads Count</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Deals Count</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Revenue (USD)</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Conversion %</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: "center" }}>
                    Loading campaigns...
                  </td>
                </tr>
              ) : filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: "center" }}>
                    No campaigns found.
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "14px 16px", fontWeight: 600 }}>{item.name}</td>
                    <td style={{ padding: "14px 16px" }}>{item.channel || "-"}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{item.leadsCount}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{item.dealsCount}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{formatUsd(item.revenueUsd)}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{toPercent(item.conversionRate)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
