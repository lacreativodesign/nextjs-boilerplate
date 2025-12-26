"use client";

import { useEffect, useMemo, useState } from "react";
import type { SegmentDefinition, SegmentType } from "@/lib/segments";
import { getValueBand, slugify, valueBands } from "@/lib/segments";

const tabOptions: Array<{ label: string; value: SegmentType }> = [
  { label: "Service", value: "service" },
  { label: "Value", value: "value" },
  { label: "Business Type", value: "business_type" },
  { label: "Industry", value: "industry" },
  { label: "Geo", value: "geo" },
];

type ClientRecord = {
  id: string;
  companyName?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  totalPaidUsd?: number;
  segmentServices?: string[];
  segmentBusinessType?: string | null;
  segmentIndustry?: string | null;
  segmentGeo?: string | null;
  country?: string;
};

type SegmentRow = {
  id: string;
  name: string;
  slug: string;
  type: SegmentType;
  isActive: boolean;
  updatedAt?: string | null;
  createdAt?: string | null;
  clientCount: number;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US");
}

export default function ClientSegmentsPage() {
  const [isDark, setIsDark] = useState(false);
  const [activeTab, setActiveTab] = useState<SegmentType>("service");
  const [segments, setSegments] = useState<SegmentDefinition[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canAdmin, setCanAdmin] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<SegmentRow | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [manageName, setManageName] = useState("");
  const [manageActive, setManageActive] = useState(true);
  const [manageLoading, setManageLoading] = useState(false);
  const [sortKey, setSortKey] = useState<"name" | "type" | "clients" | "status" | "updated">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // OS-level theme only
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setIsDark(!!mql.matches);
    onChange();
    // @ts-expect-error older browsers
    mql.addEventListener ? mql.addEventListener("change", onChange) : mql.addListener(onChange);
    return () => {
      // @ts-expect-error older browsers
      mql.removeEventListener ? mql.removeEventListener("change", onChange) : mql.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadSegments() {
      setLoading(true);
      setError(null);

      try {
        const [segmentsRes, clientsRes] = await Promise.all([
          fetch("/api/admin/clients/segments/list", {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }),
          fetch("/api/admin/clients/list", {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }),
        ]);

        const segmentsJson = await segmentsRes.json().catch(() => ({}));
        const clientsJson = await clientsRes.json().catch(() => ({}));

        if (!segmentsRes.ok || !segmentsJson?.ok) {
          throw new Error(segmentsJson?.error || "Failed to load segments");
        }
        if (!clientsRes.ok || !clientsJson?.ok) {
          throw new Error(clientsJson?.error || "Failed to load clients");
        }

        if (!alive) return;
        setSegments(Array.isArray(segmentsJson?.segments) ? segmentsJson.segments : []);
        setClients(Array.isArray(clientsJson?.clients) ? clientsJson.clients : []);
        setCanAdmin(Boolean(segmentsJson?.canAdmin));
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Failed to load client segments");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    loadSegments();
    return () => {
      alive = false;
    };
  }, []);

  const segmentsByType = useMemo(() => {
    const grouped: Record<string, SegmentDefinition[]> = {};
    segments.forEach((segment) => {
      if (!grouped[segment.type]) grouped[segment.type] = [];
      grouped[segment.type].push(segment);
    });
    return grouped;
  }, [segments]);

  const normalizedClients = useMemo(() => {
    return (clients || []).map((client) => {
      const geo = client.segmentGeo || slugify(client.country || "");
      return {
        ...client,
        segmentGeo: geo || null,
        segmentServices: Array.isArray(client.segmentServices) ? client.segmentServices : [],
        totalPaidUsd: Number(client.totalPaidUsd || 0),
      };
    });
  }, [clients]);

  const segmentRows = useMemo(() => {
    const rows: SegmentRow[] = [];

    if (activeTab === "value") {
      valueBands.forEach((band) => {
        const count = normalizedClients.filter((client) => getValueBand(client.totalPaidUsd || 0).slug === band.slug).length;
        rows.push({
          id: `value-${band.slug}`,
          name: band.name,
          slug: band.slug,
          type: "value",
          isActive: true,
          updatedAt: null,
          createdAt: null,
          clientCount: count,
        });
      });

      return rows;
    }

    const list = segmentsByType[activeTab] || [];
    list.forEach((segment) => {
      const count = normalizedClients.filter((client) => {
        if (activeTab === "service") return client.segmentServices?.includes(segment.slug);
        if (activeTab === "business_type") return client.segmentBusinessType === segment.slug;
        if (activeTab === "industry") return client.segmentIndustry === segment.slug;
        if (activeTab === "geo") return client.segmentGeo === segment.slug;
        return false;
      }).length;

      rows.push({
        id: segment.id,
        name: segment.name,
        slug: segment.slug,
        type: segment.type as SegmentType,
        isActive: segment.isActive,
        updatedAt: segment.updatedAt || null,
        createdAt: segment.createdAt || null,
        clientCount: count,
      });
    });

    return rows;
  }, [activeTab, normalizedClients, segmentsByType]);

  const sortedSegmentRows = useMemo(() => {
    const rows = [...segmentRows];
    const direction = sortDirection === "asc" ? 1 : -1;

    const valueForRow = (row: SegmentRow) => {
      switch (sortKey) {
        case "name":
          return row.name.toLowerCase();
        case "type":
          return (row.type === "business_type" ? "Business Type" : row.type).toLowerCase();
        case "clients":
          return row.clientCount;
        case "status":
          return row.isActive ? 1 : 0;
        case "updated": {
          const ts = row.updatedAt || row.createdAt;
          return ts ? new Date(ts).getTime() : 0;
        }
        default:
          return row.name.toLowerCase();
      }
    };

    rows.sort((a, b) => {
      const aVal = valueForRow(a);
      const bVal = valueForRow(b);
      if (typeof aVal === "number" && typeof bVal === "number") {
        return (aVal - bVal) * direction;
      }
      return String(aVal).localeCompare(String(bVal)) * direction;
    });

    return rows;
  }, [segmentRows, sortDirection, sortKey]);

  const kpis = useMemo(() => {
    const totalSegments = segmentRows.length;
    const activeSegments = segmentRows.filter((row) => row.isActive).length;
    const totalClients = normalizedClients.length || 0;

    const coveredClients = normalizedClients.filter((client) => {
      if (activeTab === "service") return (client.segmentServices || []).length > 0;
      if (activeTab === "business_type") return Boolean(client.segmentBusinessType);
      if (activeTab === "industry") return Boolean(client.segmentIndustry);
      if (activeTab === "geo") return Boolean(client.segmentGeo);
      return true;
    }).length;

    const coveredPct = totalClients ? Math.round((coveredClients / totalClients) * 100) : 0;
    const topSegment = segmentRows.reduce(
      (top, row) => (row.clientCount > (top?.clientCount || 0) ? row : top),
      null as SegmentRow | null
    );

    return {
      totalSegments,
      activeSegments,
      coveredPct,
      topSegmentName: topSegment?.name || "-",
    };
  }, [activeTab, normalizedClients, segmentRows]);

  const drawerClients = useMemo(() => {
    if (!selectedSegment) return [];

    return normalizedClients.filter((client) => {
      if (selectedSegment.type === "value") {
        return getValueBand(client.totalPaidUsd || 0).slug === selectedSegment.slug;
      }
      if (selectedSegment.type === "service") return client.segmentServices?.includes(selectedSegment.slug);
      if (selectedSegment.type === "business_type") return client.segmentBusinessType === selectedSegment.slug;
      if (selectedSegment.type === "industry") return client.segmentIndustry === selectedSegment.slug;
      if (selectedSegment.type === "geo") return client.segmentGeo === selectedSegment.slug;
      return false;
    });
  }, [normalizedClients, selectedSegment]);

  const filteredDrawerClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return drawerClients;
    return drawerClients.filter((client) => {
      const hay = [client.companyName, client.primaryContactName, client.primaryContactEmail]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [clientSearch, drawerClients]);

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 12,
    border: isDark ? "1px solid rgba(148,163,184,0.28)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(38,38,38,0.55)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.55)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isDark ? "rgba(226,232,240,0.70)" : "rgba(15,23,42,0.55)",
    borderBottom: isDark ? "1px solid rgba(148,163,184,0.25)" : "1px solid rgba(15,23,42,0.10)",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px dashed rgba(148,163,184,0.22)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.88)" : "rgba(15,23,42,0.85)",
    whiteSpace: "nowrap",
    fontWeight: 400,
  };

  const sortableHeaderButtonStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "none",
    padding: 0,
    font: "inherit",
    color: "inherit",
    cursor: "pointer",
    textTransform: "inherit",
    letterSpacing: "inherit",
  };

  function toggleSort(nextKey: "name" | "type" | "clients" | "status" | "updated") {
    setSortKey((prevKey) => {
      if (prevKey === nextKey) {
        setSortDirection((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDirection("asc");
      return nextKey;
    });
  }

  function sortIndicator(key: "name" | "type" | "clients" | "status" | "updated") {
    if (key !== sortKey) return null;
    return (
      <span style={{ fontSize: 11, opacity: 0.8 }}>{sortDirection === "asc" ? "▲" : "▼"}</span>
    );
  }

  function openDrawer(row: SegmentRow) {
    setSelectedSegment(row);
    setClientSearch("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedSegment(null);
  }

  function openManage() {
    if (!selectedSegment) return;
    setManageName(selectedSegment.name);
    setManageActive(selectedSegment.isActive);
    setManageOpen(true);
  }

  async function handleManageSave() {
    if (!selectedSegment) return;
    setManageLoading(true);

    try {
      const res = await fetch("/api/admin/clients/segments/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: selectedSegment.id,
          name: manageName.trim(),
          isActive: manageActive,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to update segment");
      }

      setSegments((prev) =>
        prev.map((segment) =>
          segment.id === selectedSegment.id
            ? { ...segment, name: manageName.trim(), isActive: manageActive, updatedAt: new Date().toISOString() }
            : segment
        )
      );
      setSelectedSegment((prev) =>
        prev
          ? { ...prev, name: manageName.trim(), isActive: manageActive, updatedAt: new Date().toISOString() }
          : prev
      );
      setManageOpen(false);
    } catch (err: any) {
      alert(err?.message || "Failed to update segment");
    } finally {
      setManageLoading(false);
    }
  }

  async function handleDeleteSegment() {
    if (!selectedSegment) return;
    const confirmed = window.confirm("Delete this segment? It will be deactivated.");
    if (!confirmed) return;

    setManageLoading(true);
    try {
      const res = await fetch("/api/admin/clients/segments/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: selectedSegment.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to delete segment");

      setSegments((prev) =>
        prev.map((segment) =>
          segment.id === selectedSegment.id
            ? { ...segment, isActive: false, updatedAt: new Date().toISOString() }
            : segment
        )
      );
      setSelectedSegment((prev) =>
        prev ? { ...prev, isActive: false, updatedAt: new Date().toISOString() } : prev
      );
      setManageOpen(false);
    } catch (err: any) {
      alert(err?.message || "Failed to delete segment");
    } finally {
      setManageLoading(false);
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <h1
        style={{
          fontSize: 34,
          fontWeight: 900,
          marginBottom: 8,
          color: isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)",
        }}
      >
        Client Segments
      </h1>
      <div style={{ marginBottom: 18, color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.65)" }}>
        Manage segmentation definitions and track coverage across your client base.
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-full border border-slate-200/70 bg-slate-100/80 p-1 dark:border-neutral-800/70 dark:bg-neutral-900/70">
        {tabOptions.map((tab) => {
          const active = tab.value === activeTab;
          return (
            <button
              key={tab.value}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-slate-300/80 bg-white/90 text-slate-900 shadow-sm dark:border-neutral-700/80 dark:bg-neutral-800 dark:text-slate-100"
                  : "border-transparent text-slate-600 hover:border-slate-300/60 hover:bg-white/70 dark:text-slate-300 dark:hover:border-neutral-700/60 dark:hover:bg-neutral-800/60"
              }`}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div style={{ marginBottom: 12, color: "#ef4444" }}>{error}</div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20,
          marginBottom: 20,
        }}
      >
        {[
          { label: "Total Segments", value: kpis.totalSegments },
          { label: "Active Segments", value: kpis.activeSegments },
          { label: "Clients Covered", value: `${kpis.coveredPct}%` },
          { label: "Top Segment", value: kpis.topSegmentName },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              padding: 20,
              borderRadius: 14,
              background: isDark ? "rgba(23,23,23,0.85)" : "rgba(255,255,255,0.92)",
              border: isDark ? "1px solid rgba(148,163,184,0.22)" : "1px solid rgba(15,23,42,0.08)",
              boxShadow: isDark ? "0 16px 32px rgba(0,0,0,0.35)" : "0 16px 32px rgba(15,23,42,0.08)",
              transition: "transform 180ms ease, box-shadow 180ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = isDark
                ? "0 20px 40px rgba(0,0,0,0.45)"
                : "0 20px 40px rgba(15,23,42,0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = isDark
                ? "0 16px 32px rgba(0,0,0,0.35)"
                : "0 16px 32px rgba(15,23,42,0.08)";
            }}
          >
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: isDark ? "rgba(226,232,240,0.70)" : "rgba(15,23,42,0.55)",
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: 22,
                marginTop: 8,
                color: isDark ? "rgba(255,255,255,0.9)" : "rgba(15,23,42,0.85)",
                fontWeight: 700,
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div style={tableShellStyle}>
        {loading ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            Loading segments...
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 960 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>
                    <button type="button" style={sortableHeaderButtonStyle} onClick={() => toggleSort("name")}>
                      Segment Name {sortIndicator("name")}
                    </button>
                  </th>
                  <th style={headerCellStyle}>
                    <button type="button" style={sortableHeaderButtonStyle} onClick={() => toggleSort("type")}>
                      Type {sortIndicator("type")}
                    </button>
                  </th>
                  <th style={headerCellStyle}>
                    <button type="button" style={sortableHeaderButtonStyle} onClick={() => toggleSort("clients")}>
                      Clients {sortIndicator("clients")}
                    </button>
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>
                    <button type="button" style={sortableHeaderButtonStyle} onClick={() => toggleSort("status")}>
                      Status {sortIndicator("status")}
                    </button>
                  </th>
                  <th style={headerCellStyle}>
                    <button type="button" style={sortableHeaderButtonStyle} onClick={() => toggleSort("updated")}>
                      Updated {sortIndicator("updated")}
                    </button>
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedSegmentRows.map((row, idx) => {
                  const rowBg = isDark
                    ? idx % 2 === 0
                      ? "rgba(255,255,255,0.02)"
                      : "rgba(255,255,255,0.00)"
                    : idx % 2 === 0
                    ? "rgba(15,23,42,0.015)"
                    : "rgba(15,23,42,0.00)";
                  const hoverBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)";

                  return (
                    <tr
                      key={row.id}
                      style={{ background: rowBg, transition: "background 120ms ease" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = rowBg)}
                    >
                      <td style={{ ...cellStyle, textAlign: "left" }}>{row.name}</td>
                      <td style={{ ...cellStyle, textAlign: "left" }}>
                        {row.type === "business_type" ? "Business Type" : row.type}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{row.clientCount}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{row.isActive ? "Active" : "Inactive"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(row.updatedAt || row.createdAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <button
                          className="btn ghost"
                          style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 400 }}
                          onClick={() => openDrawer(row)}
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

      {drawerOpen && selectedSegment && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={closeDrawer}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "min(460px, 92vw)",
              height: "100%",
              padding: 18,
              background: isDark ? "rgba(18,18,18,0.96)" : "rgba(255,255,255,0.96)",
              borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  {selectedSegment.name}
                </div>
                <div
                  style={{
                    opacity: 0.75,
                    fontSize: 12,
                    color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.65)",
                  }}
                >
                  {selectedSegment.type}
                </div>
              </div>

              <button
                className="btn ghost"
                onClick={closeDrawer}
                style={{ height: 34, borderRadius: 999, fontWeight: 400 }}
              >
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.02)",
                border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(15,23,42,0.06)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  opacity: 0.75,
                  color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.65)",
                }}
              >
                Segment Details
              </div>
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {[
                  { label: "Status", value: selectedSegment.isActive ? "Active" : "Inactive" },
                  { label: "Slug", value: selectedSegment.slug },
                  { label: "Created", value: fmtDate(selectedSegment.createdAt) },
                  { label: "Updated", value: fmtDate(selectedSegment.updatedAt) },
                ].map((row) => (
                  <div
                    key={row.label}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.7,
                        fontWeight: 400,
                        color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.7)",
                      }}
                    >
                      {row.label}
                    </div>
                    <div
                      style={{
                        fontWeight: 400,
                        textAlign: "right",
                        color: isDark ? "rgba(255,255,255,0.9)" : "rgba(15,23,42,0.9)",
                      }}
                    >
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 14 }} />

            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.02)",
                border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(15,23,42,0.06)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  opacity: 0.75,
                  color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.65)",
                }}
              >
                Clients in Segment
              </div>
              <div style={{ marginTop: 10 }}>
                <input
                  className="input"
                  placeholder="Search clients"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
              </div>
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {filteredDrawerClients.length === 0 ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: isDark ? "rgba(255,255,255,0.7)" : "rgba(15,23,42,0.65)",
                    }}
                  >
                    No clients found.
                  </div>
                ) : (
                  filteredDrawerClients.slice(0, 10).map((client) => (
                    <div
                      key={client.id}
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 400,
                          color: isDark ? "rgba(255,255,255,0.9)" : "rgba(15,23,42,0.9)",
                        }}
                      >
                        {client.companyName || "-"}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: isDark ? "rgba(255,255,255,0.7)" : "rgba(15,23,42,0.65)",
                        }}
                      >
                        {client.primaryContactName || "-"} · {client.primaryContactEmail || "-"}
                      </div>
                    </div>
                  ))
                )}
                {filteredDrawerClients.length > 10 ? (
                  <div style={{ fontSize: 12, color: isDark ? "rgba(255,255,255,0.6)" : "rgba(15,23,42,0.55)" }}>
                    Showing 10 of {filteredDrawerClients.length} clients
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ height: 14 }} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="btn"
                style={{ borderRadius: 12, fontWeight: 400 }}
                onClick={() => {
                  if (!canAdmin) return;
                  openManage();
                }}
                disabled={!canAdmin}
              >
                Manage Segment
              </button>
            </div>
          </div>
        </div>
      )}

      {manageOpen && selectedSegment && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.4)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
          onClick={() => setManageOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 420,
              margin: "10vh auto",
              background: isDark ? "rgba(18,18,18,0.96)" : "#fff",
              borderRadius: 16,
              padding: 18,
              border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.12)",
              boxShadow: isDark ? "0 20px 45px rgba(0,0,0,0.5)" : "0 20px 45px rgba(15,23,42,0.12)",
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                marginBottom: 12,
                color: isDark ? "rgba(255,255,255,0.9)" : "rgba(15,23,42,0.9)",
              }}
            >
              Manage Segment
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: isDark ? "rgba(255,255,255,0.7)" : "rgba(15,23,42,0.6)",
                    marginBottom: 6,
                  }}
                >
                  Segment Name
                </div>
                <input className="input" value={manageName} onChange={(e) => setManageName(e.target.value)} />
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  color: isDark ? "rgba(255,255,255,0.8)" : "rgba(15,23,42,0.8)",
                }}
              >
                <input
                  type="checkbox"
                  checked={manageActive}
                  onChange={(e) => setManageActive(e.target.checked)}
                />
                Active segment
              </label>
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button
                type="button"
                className="btn ghost"
                style={{ borderRadius: 12, fontWeight: 400 }}
                onClick={() => setManageOpen(false)}
              >
                Cancel
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn ghost"
                  style={{
                    borderRadius: 12,
                    fontWeight: 400,
                    background: "rgba(239,68,68,0.12)",
                    border: "1px solid rgba(239,68,68,0.35)",
                    color: "rgba(15,23,42,0.86)",
                  }}
                  onClick={handleDeleteSegment}
                  disabled={manageLoading}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ borderRadius: 12, fontWeight: 400 }}
                  onClick={handleManageSave}
                  disabled={manageLoading}
                >
                  {manageLoading ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
