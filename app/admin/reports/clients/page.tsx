"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, formatUsd } from "@/components/finance/financeUtils";
import MasterSelect from "@/components/ui/MasterSelect";
import { CardShell, ErrorCard, KpiCard, MiniBarChart, useSortableData } from "../_components/ReportsUI";

type ClientResponse = {
  keyAccounts: Array<{ id: string; name: string; totalPaidUsd: number }>;
  clientHealthDistribution: Array<{ label: string; value: number }>;
  changeRequestsByClient: Array<{ clientId: string; clientName: string; count: number }>;
  segmentCoverage: Array<{ label: string; value: number }>;
  clients: Array<{ id: string; name: string; totalPaidUsd: number; activeProjects: number; lastActivity?: string | null }>;
  segmentOptions: {
    service: string[];
    business_type: string[];
    industry: string[];
    geo: string[];
    value: string[];
  };
};

const emptyResponse: ClientResponse = {
  keyAccounts: [],
  clientHealthDistribution: [],
  changeRequestsByClient: [],
  segmentCoverage: [],
  clients: [],
  segmentOptions: { service: [], business_type: [], industry: [], geo: [], value: [] },
};

const SEGMENT_TYPES = [
  { label: "All Segments", value: "" },
  { label: "Service", value: "service" },
  { label: "Value", value: "value" },
  { label: "Business Type", value: "business_type" },
  { label: "Industry", value: "industry" },
  { label: "Geo", value: "geo" },
];

export default function ClientReportsPage() {
  const [data, setData] = useState<ClientResponse>(emptyResponse);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segmentType, setSegmentType] = useState("");
  const [segmentValue, setSegmentValue] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof ClientResponse["clients"][number]>("totalPaidUsd");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const loadClients = async () => {
    try {
      setError(null);
      setLoading(true);
      const params = new URLSearchParams();
      if (segmentType) params.set("segmentType", segmentType);
      if (segmentValue) params.set("segmentValue", segmentValue);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/admin/reports/clients?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 403) throw new Error("You do not have access to Admin reports.");
        if (res.status === 401) throw new Error("Please sign in again to view reports.");
        throw new Error(json?.error || "Unable to load client reports.");
      }
      setData(json as ClientResponse);
    } catch (err) {
      console.error("reports clients load error", err);
      setError("Unable to load client insights right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, [segmentType, segmentValue, dateFrom, dateTo]);

  const segmentValueOptions = useMemo(() => {
    if (!segmentType) return [{ label: "All Values", value: "" }];
    const list = data.segmentOptions[segmentType as keyof ClientResponse["segmentOptions"]] || [];
    return [{ label: "All Values", value: "" }, ...list.map((item) => ({ label: item, value: item }))];
  }, [data.segmentOptions, segmentType]);

  const filteredClients = useMemo(() => {
    if (!search) return data.clients;
    const q = search.toLowerCase();
    return data.clients.filter((client) => `${client.name}`.toLowerCase().includes(q));
  }, [data.clients, search]);

  const sortedClients = useSortableData(filteredClients, sortKey, sortDirection);

  const toggleSort = (key: keyof ClientResponse["clients"][number]) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const totalClients = data.clients.length;
  const totalKeyAccounts = data.keyAccounts.length;
  const totalChangeRequests = data.changeRequestsByClient.reduce((sum, row) => sum + row.count, 0);

  const downloadCsv = (path: string) => {
    const params = new URLSearchParams();
    if (segmentType) params.set("segmentType", segmentType);
    if (segmentValue) params.set("segmentValue", segmentValue);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    window.open(`${path}?${params.toString()}`, "_blank");
  };

  return (
    <div className="space-y-6">
      {error && <ErrorCard message={error} />}

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Client KPIs</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Total Clients" value={`${totalClients}`} subtitle="Filtered scope" />
          <KpiCard title="Key Accounts" value={`${totalKeyAccounts}`} subtitle="Above threshold" />
          <KpiCard title="Change Requests" value={`${totalChangeRequests}`} subtitle="Top 10 clients" />
          <KpiCard title="Revenue Tracked" value={formatUsd(data.clients.reduce((sum, row) => sum + row.totalPaidUsd, 0))} subtitle="Paid USD" />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Filters</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Segment coverage, key accounts, and change requests.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => downloadCsv("/api/admin/reports/exports/revenue-by-client")} style={{ borderRadius: 999 }}>
              Download Revenue by Client
            </button>
            <button className="btn ghost" onClick={() => downloadCsv("/api/admin/reports/exports/change-requests")} style={{ borderRadius: 999 }}>
              Download Change Requests
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <MasterSelect value={segmentType} onChange={setSegmentType} options={SEGMENT_TYPES} />
          <MasterSelect value={segmentValue} onChange={setSegmentValue} options={segmentValueOptions} />
          <input
            className="input"
            placeholder="Search keyword"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 200 }}
          />
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setSegmentType("");
              setSegmentValue("");
              setDateFrom("");
              setDateTo("");
              setSearch("");
            }}
            style={{ borderRadius: 999 }}
          >
            Reset Filters
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Client Health Distribution</div>
          <MiniBarChart
            rows={(data.clientHealthDistribution.length ? data.clientHealthDistribution : [{ label: "-", value: 0 }]).map(
              (row) => ({
                label: row.label,
                value: row.value,
              })
            )}
          />
        </CardShell>
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Segment Coverage</div>
          <MiniBarChart
            rows={(data.segmentCoverage.length ? data.segmentCoverage : [{ label: "-", value: 0 }]).map((row) => ({
              label: row.label,
              value: row.value,
            }))}
          />
        </CardShell>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Key Accounts</div>
          <MiniBarChart
            rows={(data.keyAccounts.length ? data.keyAccounts : [{ name: "-", totalPaidUsd: 0 }]).map((row) => ({
              label: row.name,
              value: row.totalPaidUsd,
            }))}
            valueFormatter={formatUsd}
          />
        </CardShell>
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Change Requests by Client</div>
          <MiniBarChart
            rows={(data.changeRequestsByClient.length ? data.changeRequestsByClient : [{ clientName: "-", count: 0 }]).map((row) => ({
              label: row.clientName,
              value: row.count,
            }))}
          />
        </CardShell>
      </section>

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Client Portfolio</div>
        <div className="card" style={{ padding: 0, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ background: "rgba(148,163,184,0.15)" }}>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("name")} style={{ background: "none", border: "none", fontWeight: 700 }}>
                      Client {sortKey === "name" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("totalPaidUsd")} style={{ background: "none", border: "none", fontWeight: 700 }}>
                      Revenue (USD) {sortKey === "totalPaidUsd" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("activeProjects")} style={{ background: "none", border: "none", fontWeight: 700 }}>
                      Active Projects {sortKey === "activeProjects" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: 40 }}>
                      Loading clients…
                    </td>
                  </tr>
                ) : sortedClients.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: 40 }}>
                      No clients found.
                    </td>
                  </tr>
                ) : (
                  sortedClients.map((client, idx) => {
                    const rowBg = idx % 2 === 0 ? "rgba(15,23,42,0.02)" : "transparent";
                    return (
                      <tr key={client.id} style={{ background: rowBg }}>
                        <td style={{ padding: "14px 16px", textAlign: "left" }}>{client.name}</td>
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>{formatUsd(client.totalPaidUsd)}</td>
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>{client.activeProjects}</td>
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>{formatDate(client.lastActivity)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
