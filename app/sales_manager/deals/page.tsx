"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, formatUsd, toInputDate } from "@/components/finance/financeUtils";
import { Label } from "@/components/ui/label";

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
        const res = await fetch("/api/sales_manager/deals/list", { cache: "no-store" });
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

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-subtle)",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: "1px dashed var(--border-subtle)",
    color: "var(--text-primary)",
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
      const res = await fetch("/api/sales_manager/deals/update", {
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
      const res = await fetch("/api/sales_manager/deals/update", {
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

      <div className="table-shell">
        {loading ? (
          <p style={{ fontSize: 14, color: "rgba(15,23,42,0.70)" }}>
            Loading deals...
          </p>
        ) : sortedDeals.length === 0 ? (
          <p style={{ fontSize: 14, color: "rgba(15,23,42,0.70)" }}>
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

                  return (
                    <tr
                      key={deal.id}
                      style={{ cursor: "pointer" }}
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
                <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)" }}>
                  {selected.dealName || "Deal"}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: "#334155" }}>
                  {selected.clientName || "Client"} · {selected.ownerName || "Unassigned"}
                </div>
              </div>

              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            <Section title="Deal Details">
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

            <Section title="Discount Approval">
              <InfoRow label="List Price" value={formatUsd(selected.listPriceUsd || selected.valueUsd)} />
              <InfoRow label="Discount %" value={`${Number(selected.discountPct || 0)}%`} />
              <InfoRow label="Final Price" value={formatUsd(selected.finalPriceUsd || selected.valueUsd)} />
              <InfoRow label="Status" value={selected.discountStatus || "none"} />
              {selected.discountReason && (
                <InfoRow label="Reason" value={selected.discountReason} />
              )}
              <InfoRow
                label="Requested At"
                value={formatDate(selected.discountRequestedAt)}
               
              />
              <InfoRow
                label="Approved By"
                value={selected.discountApprovedByName || selected.discountApprovedByUid || "—"}
               
              />
              <InfoRow label="Approved At" value={formatDate(selected.discountApprovedAt)} />
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

            <Section title="Linked Delivery">
              {selected.stage === "Closed Won" || selected.clientId || selected.projectId ? (
                <>
                  <InfoRow label="Client ID" value={selected.clientId || "—"} />
                  <InfoRow label="Project ID" value={selected.projectId || "—"} />
                  <InfoRow label="Payment Status" value={selected.paymentStatus || "Unpaid"} />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 14, borderRadius: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", gap: 12 }}>
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>{label}</div>
      <div style={{ fontWeight: 800, textAlign: "right" }}>{value}</div>
    </div>
  );
}
