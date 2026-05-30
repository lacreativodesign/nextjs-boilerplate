"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUsd, toInputMonth } from "@/components/finance/financeUtils";

type TargetRow = {
  uid: string;
  name: string;
  targetUsd: number;
  achievedUsd: number;
  varianceUsd: number;
};

type TargetsResponse = {
  ok: boolean;
  month: string;
  targets: TargetRow[];
};

export default function SalesManagerTargetsPage() {
  const [month, setMonth] = useState(() => toInputMonth(new Date().toISOString()));
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/sales_manager/targets?month=${encodeURIComponent(month)}`, { cache: "no-store" });
        const json = (await res.json()) as TargetsResponse;
        if (!res.ok || !json.ok) {
          throw new Error(json?.ok ? "" : "Failed to load targets");
        }
        if (!alive) return;
        setTargets(Array.isArray(json.targets) ? json.targets : []);
      } catch (err) {
        if (!alive) return;
        setError((err instanceof Error ? err.message : undefined) || "Unable to load targets.");
        setTargets([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [month]);

  const totals = useMemo(() => {
    return targets.reduce(
      (acc, row) => {
        acc.target += row.targetUsd;
        acc.achieved += row.achievedUsd;
        return acc;
      },
      { target: 0, achieved: 0 }
    );
  }, [targets]);

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Targets</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Monthly targets and progress for every sales rep.
          </p>
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: 16,
          borderRadius: 16,
          marginBottom: 16,
          display: "grid",
          gridTemplateColumns: "minmax(200px, 1fr) repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Select month</div>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Target Total</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{formatUsd(totals.target)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Achieved</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{formatUsd(totals.achieved)}</div>
        </div>
      </div>

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
          {error}
        </div>
      )}

      <div className="card" style={{ padding: 16, borderRadius: 16 }}>
        {loading ? (
          <p style={{ fontSize: 14, color: "rgba(15,23,42,0.70)" }}>
            Loading targets...
          </p>
        ) : targets.length === 0 ? (
          <p style={{ fontSize: 14, color: "rgba(15,23,42,0.70)" }}>
            No targets configured for this month.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {targets.map((row) => {
              const progress = row.targetUsd ? Math.min((row.achievedUsd / row.targetUsd) * 100, 100) : 0;
              const over = row.varianceUsd >= 0;
              return (
                <div key={row.uid} className="card" style={{ padding: 14, borderRadius: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700 }}>{row.name}</div>
                    <div style={{ fontSize: 12, color: over ? "var(--success)" : "var(--danger)" }}>
                      {over ? "+" : "-"}
                      {formatUsd(Math.abs(row.varianceUsd))}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)" }}>
                    <span>Target {formatUsd(row.targetUsd)}</span>
                    <span>Achieved {formatUsd(row.achievedUsd)}</span>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <div
                      style={{
                        height: 10,
                        borderRadius: 999,
                        background: "var(--chart-track)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${progress}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: over ? "var(--success)" : "var(--erp-blue)",
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                      {progress.toFixed(0)}% of target
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
