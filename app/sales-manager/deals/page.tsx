"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsDarkMode } from "@/lib/useIsDarkMode";
import { formatDate, formatUsd, toInputDate } from "@/components/finance/financeUtils";

const STAGE_OPTIONS = [
  "New Lead",
  "Contacted",
  "Qualified",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

type DealRecord = {
  id: string;
  dealName: string;
  clientName: string;
  stage: string;
  valueUsd: number;
  listPriceUsd?: number;
  discountPct?: number;
  discountUsd?: number;
  finalPriceUsd?: number;
  discountReason?: string | null;
  probability: number;
  ownerId: string | null;
  ownerName: string | null;
  expectedCloseDate: string | null;
  notes?: string | null;
  discountApproved?: boolean;
  discountStatus?: string;
  discountRequestedAt?: string | null;
  discountApprovedAt?: string | null;
  discountRequestedByUid?: string | null;
  discountApprovedByUid?: string | null;
  discountApprovedByName?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  paymentStatus?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type DealListResponse = { ok: boolean; deals: DealRecord[] };

type ErrorState = { title: string; message: string };

type DealFormState = {
  dealName: string;
  clientName: string;
  stage: string;
  valueUsd: string;
  probability: string;
  expectedCloseDate: string;
  notes: string;
};

export default function SalesManagerDealsPage() {
  const isDark = useIsDarkMode();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [rows, setRows] = useState<DealRecord[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<DealRecord | null>(null);
  const [formState, setFormState] = useState<DealFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/sales-manager/deals/list", { cache: "no-store" });
        const json = (await res.json()) as DealListResponse;
        if (!res.ok || !json.ok) {
          throw new Error(json?.ok ? "" : "Failed to load deals");
        }
        if (!alive) return;
        setRows(Array.isArray(json.deals) ? json.deals : []);
      } catch (err: any) {
        if (!alive) return;
        setError({ title: "Unable to load deals", message: err?.message || "Please try again later." });
        setRows([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.45)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isDark ? "rgba(226,232,240,0.66)" : "rgba(15,23,42,0.55)",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.86)" : "rgba(15,23,42,0.85)",
    whiteSpace: "nowrap",
    fontWeight: 400,
  };

  const sortedDeals = useMemo(() => {
    return [...rows].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }, [rows]);

  const openDrawer = (deal: DealRecord) => {
    setSelected(deal);
    setFormState({
      dealName: deal.dealName || "",
      clientName: deal.clientName || "",
      stage: deal.stage || "New Lead",
      valueUsd: Number(deal.valueUsd || 0).toString(),
      probability: Number(deal.probability || 0).toString(),
      expectedCloseDate: toInputDate(deal.expectedCloseDate),
      notes: deal.notes || "",
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
    setFormState(null);
    setApprovalLoading(false);
  };

  const handleSave = async () => {
    if (!selected || !formState) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sales-manager/deals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          dealName: formState.dealName,
          clientName: formState.clientName,
          stage: formState.stage,
          valueUsd: Number(formState.valueUsd || 0),
          probability: Number(formState.probability || 0),
          expectedCloseDate: formState.expectedCloseDate || null,
          notes: formState.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Unable to update deal.");
      }

      setRows((prev) =>
        prev.map((deal) =>
          deal.id === selected.id
            ? {
                ...deal,
                dealName: formState.dealName,
                clientName: formState.clientName,
                stage: formState.stage,
                valueUsd: Number(formState.valueUsd || 0),
                probability: Number(formState.probability || 0),
                expectedCloseDate: formState.expectedCloseDate || null,
                notes: formState.notes,
              }
            : deal
        )
      );
      closeDrawer();
    } catch (err) {
      console.error("Deal update failed", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscountDecision = async (action: "approve" | "reject") => {
    if (!selected) return;
    setApprovalLoading(true);
    try {
      const res = await fetch("/api/sales-manager/deals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, discountAction: action }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Unable to update discount.");
      }
      setRows((prev) =>
        prev.map((deal) =>
          deal.id === selected.id
            ? {
                ...deal,
                discountStatus: action === "approve" ? "approved" : "rejected",
                discountApproved: action === "approve",
                discountApprovedAt: new Date().toISOString(),
                discountApprovedByName: "You",
              }
            : deal
        )
      );
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              discountStatus: action === "approve" ? "approved" : "rejected",
              discountApproved: action === "approve",
              discountApprovedAt: new Date().toISOString(),
              discountApprovedByName: "You",
            }
          : prev
      );
    } catch (err) {
      console.error("Discount approval failed", err);
    } finally {
      setApprovalLoading(false);
    }
  };

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Deals</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            All deals with outcome controls, notes, and linked delivery visibility.
          </p>
        </div>
      </div>

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

      <div style={tableShellStyle}>
        {loading ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            Loading deals...
          </p>
        ) : sortedDeals.length === 0 ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            No deals found.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Deal</th>
                  <th style={headerCellStyle}>Client</th>
                  <th style={headerCellStyle}>Stage</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Value</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Discount</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Probability</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Owner</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Updated</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedDeals.map((deal, idx) => {
                  const rowBg = isDark
                    ? idx % 2 === 0
                      ? "rgba(255,255,255,0.015)"
                      : "rgba(255,255,255,0.00)"
                    : idx % 2 === 0
                    ? "rgba(15,23,42,0.015)"
                    : "rgba(15,23,42,0.00)";
                  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.03)";

                  return (
                    <tr
                      key={deal.id}
                      style={{ background: rowBg, transition: "background 120ms ease", cursor: "pointer" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = rowBg)}
                      onClick={() => openDrawer(deal)}
                    >
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{deal.dealName || "-"}</td>
                      <td style={cellStyle}>{deal.clientName || "-"}</td>
                      <td style={cellStyle}>{deal.stage || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{formatUsd(deal.valueUsd)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        {deal.discountStatus ? deal.discountStatus.replaceAll("_", " ") : "None"}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{deal.probability}%</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{deal.ownerName || "Unassigned"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{formatDate(deal.updatedAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <button
                          className="btn ghost"
                          style={{ padding: "8px 14px", borderRadius: 999 }}
                          onClick={(event) => {
                            event.stopPropagation();
                            openDrawer(deal);
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawerOpen && selected && formState && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--md" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  {selected.dealName || "Deal"}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  {selected.clientName || "Client"} · {selected.ownerName || "Unassigned"}
                </div>
              </div>

              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            <Section title="Deal Details" isDark={isDark}>
              <Label>Deal Name</Label>
              <input
                className="input"
                value={formState.dealName}
                onChange={(e) => setFormState({ ...formState, dealName: e.target.value })}
              />

              <Label>Client Name</Label>
              <input
                className="input"
                value={formState.clientName}
                onChange={(e) => setFormState({ ...formState, clientName: e.target.value })}
              />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                <div>
                  <Label>Value (USD)</Label>
                  <input
                    className="input"
                    type="number"
                    value={formState.valueUsd}
                    onChange={(e) => setFormState({ ...formState, valueUsd: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Probability %</Label>
                  <input
                    className="input"
                    type="number"
                    value={formState.probability}
                    onChange={(e) => setFormState({ ...formState, probability: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Expected Close</Label>
                  <input
                    className="input"
                    type="date"
                    value={formState.expectedCloseDate}
                    onChange={(e) => setFormState({ ...formState, expectedCloseDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Stage</Label>
                  <select
                    className="input"
                    value={formState.stage}
                    onChange={(e) => setFormState({ ...formState, stage: e.target.value })}
                  >
                    {STAGE_OPTIONS.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Label>Notes</Label>
              <textarea
                className="input"
                rows={4}
                value={formState.notes}
                onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
              />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Discount Approval" isDark={isDark}>
              <InfoRow label="List Price" value={formatUsd(selected.listPriceUsd || selected.valueUsd)} isDark={isDark} />
              <InfoRow label="Discount %" value={`${Number(selected.discountPct || 0)}%`} isDark={isDark} />
              <InfoRow label="Final Price" value={formatUsd(selected.finalPriceUsd || selected.valueUsd)} isDark={isDark} />
              <InfoRow label="Status" value={selected.discountStatus || "none"} isDark={isDark} />
              {selected.discountReason && (
                <InfoRow label="Reason" value={selected.discountReason} isDark={isDark} />
              )}
              <InfoRow
                label="Requested At"
                value={formatDate(selected.discountRequestedAt)}
                isDark={isDark}
              />
              <InfoRow
                label="Approved By"
                value={selected.discountApprovedByName || selected.discountApprovedByUid || "—"}
                isDark={isDark}
              />
              <InfoRow label="Approved At" value={formatDate(selected.discountApprovedAt)} isDark={isDark} />
              {selected.discountStatus === "pending" && (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    className="btn ghost"
                    onClick={() => handleDiscountDecision("reject")}
                    disabled={approvalLoading}
                  >
                    Reject
                  </button>
                  <button className="btn" onClick={() => handleDiscountDecision("approve")} disabled={approvalLoading}>
                    Approve
                  </button>
                </div>
              )}
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Linked Delivery" isDark={isDark}>
              {selected.stage === "Closed Won" || selected.clientId || selected.projectId ? (
                <>
                  <InfoRow label="Client ID" value={selected.clientId || "—"} isDark={isDark} />
                  <InfoRow label="Project ID" value={selected.projectId || "—"} isDark={isDark} />
                  <InfoRow label="Payment Status" value={selected.paymentStatus || "Unpaid"} isDark={isDark} />
                </>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Linked records appear once a deal is won.</div>
              )}
            </Section>

            <div style={{ height: 16 }} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn ghost" onClick={closeDrawer} disabled={saving}>
                Cancel
              </button>
              <button className="btn" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  isDark,
}: {
  title: string;
  children: React.ReactNode;
  isDark: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>{label}</div>
      <div style={{ fontWeight: 800, textAlign: "right" }}>{value}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>{children}</div>;
}
