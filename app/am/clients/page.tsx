"use client";

import { useEffect, useMemo, useState } from "react";

type ClientRecord = {
  id: string;
  companyName: string;
  industry?: string;
  country?: string;
  timezone?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  totalProjects?: number;
  lastActivity?: string | null;
};

type ClientsPayload = {
  ok: boolean;
  clients: ClientRecord[];
};


function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function AMClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ClientRecord | null>(null);

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: "1px solid var(--border-subtle)",
    background: "var(--surface-card)",
    boxShadow: "var(--shadow-md)",
  };

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

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/am/clients/list", { credentials: "include", cache: "no-store" });
        const payload = (await res.json()) as ClientsPayload;
        if (!res.ok || !payload.ok) {
          throw new Error(payload?.error || "Unable to load clients.");
        }
        if (active) setClients(payload.clients || []);
      } catch (err: any) {
        console.error(err);
        if (active) setError(err?.message || "Unable to load clients.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) => {
      const hay = [
        client.companyName,
        client.primaryContactName,
        client.primaryContactEmail,
        client.primaryContactPhone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [clients, search]);

  const openDrawer = (client: ClientRecord) => {
    setSelected(client);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">My Clients</h1>
        <p className="page-subtitle">Active clients connected to your assigned projects.</p>
      </div>

      <div style={tableShellStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Client Directory</div>
          <button className="btn ghost" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            className="input"
            placeholder="Search keyword"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 12, borderRadius: 12, borderColor: "var(--danger)" }}>
          <span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>
        </div>
      )}

      <div style={tableShellStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr>
                <th style={headerCellStyle}>Client</th>
                <th style={headerCellStyle}>Primary Contact</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>Projects</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>Last Activity</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id}>
                  <td style={{ ...cellStyle, textAlign: "left" }}>
                    {client.companyName}
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {client.industry || "—"} · {client.country || "—"}
                    </div>
                  </td>
                  <td style={{ ...cellStyle, textAlign: "left" }}>
                    {client.primaryContactName || "—"}
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{client.primaryContactEmail || ""}</div>
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{client.totalProjects || 0}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(client.lastActivity)}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <button className="btn ghost" onClick={() => openDrawer(client)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...cellStyle, textAlign: "center", padding: "24px 16px" }}>
                    No clients found.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} style={{ ...cellStyle, textAlign: "center", padding: "24px 16px" }}>
                    Loading clients...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && selected && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--sm" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-title">{selected.companyName}</div>
            <div className="drawer-subtitle">Client Profile (Read-only)</div>
            <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
              <div>
                <strong>Primary Contact:</strong> {selected.primaryContactName || "—"}
              </div>
              <div>
                <strong>Email:</strong> {selected.primaryContactEmail || "—"}
              </div>
              <div>
                <strong>Phone:</strong> {selected.primaryContactPhone || "—"}
              </div>
              <div>
                <strong>Timezone:</strong> {selected.timezone || "—"}
              </div>
              <div>
                <strong>Industry:</strong> {selected.industry || "—"}
              </div>
              <div>
                <strong>Country:</strong> {selected.country || "—"}
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <button className="btn ghost" onClick={closeDrawer} style={{ width: "100%" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
