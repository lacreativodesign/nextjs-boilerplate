"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUsd } from "@/components/finance/financeUtils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

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
  const isDark = useIsDarkMode();
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

      <div
        className="card"
        style={{
          marginTop: 20,
          padding: 0,
          borderRadius: 18,
          background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.95)",
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
          boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.35)" : "0 18px 40px rgba(15,23,42,0.08)",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
            <thead>
              <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
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
                  <tr key={item.id} style={{ borderTop: isDark ? "1px solid rgba(148,163,184,0.15)" : "1px solid #e2e8f0" }}>
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
