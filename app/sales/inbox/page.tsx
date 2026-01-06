"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SalesDrawer from "@/components/sales/SalesDrawer";
import { formatDateTime } from "@/components/finance/financeUtils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

type EmailRecord = {
  id: string;
  subject: string;
  from: string[];
  to: string[];
  bodyText: string;
  direction: string;
  createdAt: string | null;
  status: string;
};

type InboxResponse = { ok: boolean; emails: EmailRecord[] };

type ErrorState = { title: string; message: string };

export default function SalesInboxPage() {
  const isDark = useIsDarkMode();
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<EmailRecord | null>(null);

  const loadEmails = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/sales/email/list", { cache: "no-store", credentials: "include" });
      const data = (await res.json()) as InboxResponse;
      if (!res.ok || !data.ok) {
        setEmails([]);
        setError(null);
        return;
      }
      setEmails(data.emails || []);
    } catch (err: any) {
      console.error("Inbox load error", err);
      setEmails([]);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter((email) => {
      const hay = [email.subject, email.from?.[0], email.to?.[0], email.bodyText].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [emails, query]);

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
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Sales Inbox</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            View inbound and outbound messages synced to your mailbox.
          </p>
        </div>
        <button className="btn" onClick={loadEmails} style={{ borderRadius: 999 }}>
          Refresh
        </button>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 18, borderRadius: 18 }}>
        <label className="text-xs font-semibold text-slate-500">Search</label>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search inbox"
          className="input mt-2"
        />
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={tableShellStyle}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900, tableLayout: "fixed" }}>
              <thead>
                <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                  <th style={headerCellStyle}>Subject</th>
                  <th style={headerCellStyle}>From / To</th>
                  <th style={headerCellStyle}>Direction</th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Received</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center" }}>
                      Loading inbox...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center" }}>
                      No emails found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((email) => (
                    <tr key={email.id}>
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{email.subject || "(no subject)"}</td>
                      <td style={cellStyle}>
                        {email.direction === "outbound" ? email.to?.[0] : email.from?.[0]}
                      </td>
                      <td style={cellStyle}>{email.direction}</td>
                      <td style={{ ...cellStyle, textAlign: "left" }}>{formatDateTime(email.createdAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <button className="btn ghost" onClick={() => setSelected(email)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <SalesDrawer title={selected.subject || "Email"} subtitle={selected.direction} onClose={() => setSelected(null)}>
          <div className="grid gap-2 text-sm">
            <div>
              <strong>From:</strong> {selected.from?.[0] || "-"}
            </div>
            <div>
              <strong>To:</strong> {selected.to?.[0] || "-"}
            </div>
            <div>
              <strong>Received:</strong> {formatDateTime(selected.createdAt)}
            </div>
          </div>
          <div style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{selected.bodyText}</div>
        </SalesDrawer>
      )}
    </div>
  );
}
