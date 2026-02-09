"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";
import LoadingButton from "@/components/ui/LoadingButton";
import { SkeletonTable } from "@/components/ui/skeleton";
import { AdvancedSearchDialog } from "@/components/search/AdvancedSearchDialog";
import { toastError, toastPromise } from "@/lib/toast";
import type { SearchFilter } from "@/types/search";

type UserRecord = {
  uid?: string;
  id?: string;
  docId?: string;
  userId?: string;
  firebaseUid?: string;

  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  department?: string;
  salary?: number | string;
  joiningDate?: string;
  designation?: string;
  monthlyTarget?: number | string;
  commission?: number | string;
  status?: string;
  mfaEnabled?: boolean;
  cnic?: string;
  dob?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
};

type SortKey = "name" | "email" | "phone" | "department" | "status";
type SortDir = "asc" | "desc";

type FilterRow = {
  id: string;
  field: string;
  operator: string;
  value: string;
};

type SearchField = { name: string; label: string; type: "string" | "number" | "boolean" };

const userSearchFields: SearchField[] = [
  { name: "name", label: "Name", type: "string" },
  { name: "email", label: "Email", type: "string" },
  { name: "phone", label: "Phone", type: "string" },
  { name: "department", label: "Department", type: "string" },
  { name: "role", label: "Role", type: "string" },
  { name: "status", label: "Status", type: "string" },
  { name: "mfaEnabled", label: "MFA Enabled", type: "boolean" },
  { name: "createdAt", label: "Created At", type: "string" },
];

const normalizeFilterValue = (value: string | undefined, type?: SearchField["type"]) => {
  if (value === undefined) return value;
  if (type === "number") {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : numeric;
  }
  if (type === "boolean") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return value;
};

/** Always get a usable ID no matter what your API returns */
const getRowId = (u: any) =>
  (u?.uid || u?.id || u?.docId || u?.userId || u?.firebaseUid || u?.email || "") as string;

/** OS/Browser theme only */
function useIsSystemDark() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => setIsDark(!!mql.matches);
    read();
    // @ts-expect-error older browsers
    mql.addEventListener ? mql.addEventListener("change", read) : mql.addListener(read);
    return () => {
      // @ts-expect-error older browsers
      mql.removeEventListener ? mql.removeEventListener("change", read) : mql.removeListener(read);
    };
  }, []);

  return isDark;
}

export default function UsersPage() {
  const isDark = useIsSystemDark();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [resettingMfaUid, setResettingMfaUid] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedActive, setAdvancedActive] = useState(false);

  const router = useRouter();

  const buildSearchFilters = useCallback((filters: FilterRow[]): SearchFilter[] => {
    const fieldMap = new Map(userSearchFields.map((field) => [field.name, field]));

    return filters
      .filter((filter) => filter.field && filter.operator)
      .map((filter) => {
        const fieldConfig = fieldMap.get(filter.field);
        const trimmed = filter.value?.toString().trim();

        if (filter.operator === "isNull" || filter.operator === "isNotNull") {
          return { field: filter.field, operator: filter.operator as SearchFilter["operator"], value: null };
        }

        if (filter.operator === "between") {
          const parts = trimmed ? trimmed.split(",").map((part) => part.trim()).filter(Boolean) : [];
          const normalized = parts.slice(0, 2).map((part) => normalizeFilterValue(part, fieldConfig?.type));
          return { field: filter.field, operator: "between", value: normalized };
        }

        if (filter.operator === "in" || filter.operator === "notIn") {
          const parts = trimmed ? trimmed.split(",").map((part) => part.trim()).filter(Boolean) : [];
          const normalized = parts.map((part) => normalizeFilterValue(part, fieldConfig?.type));
          return { field: filter.field, operator: filter.operator as SearchFilter["operator"], value: normalized };
        }

        return {
          field: filter.field,
          operator: filter.operator as SearchFilter["operator"],
          value: normalizeFilterValue(trimmed, fieldConfig?.type),
        };
      });
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadUsers() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/admin/users/list", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error((json as any)?.error || "Failed to load users");
        }

        // Supports BOTH:
        // 1) API returns array: [...]
        // 2) API returns object: { ok: true, users: [...] }
        const list: any[] = Array.isArray(json) ? json : Array.isArray((json as any)?.users) ? (json as any).users : [];

        if (!alive) return;
        setUsers(list as UserRecord[]);
      } catch (err: any) {
        if (!alive) return;
        const message = err?.message || "Unexpected error occurred.";
        setError(message);
        toastError(message);
        setUsers([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    loadUsers();
    return () => {
      alive = false;
    };
  }, []);

  const handleAdvancedSearch = useCallback(
    async (filters: FilterRow[]) => {
      try {
        setLoading(true);
        setError("");
        const payloadFilters = buildSearchFilters(filters);
        const res = await fetch("/api/users/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: payloadFilters,
            sortBy: sortKey,
            sortOrder: sortDir,
            page: 1,
            limit: 200,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || "Failed to search users");
        }
        const list: UserRecord[] = Array.isArray(json?.results) ? json.results : [];
        setUsers(list);
        setSearch("");
        setAdvancedActive(true);
      } catch (err: any) {
        const message = err?.message || "Failed to search users";
        setError(message);
        toastError(message);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    },
    [buildSearchFilters, sortDir, sortKey]
  );

  const handleSaveSearch = useCallback(
    async (name: string, filters: FilterRow[]) => {
      const payloadFilters = buildSearchFilters(filters);
      await toastPromise(
        fetch("/api/saved-searches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            module: "users",
            filters: payloadFilters,
            sortBy: sortKey,
            sortOrder: sortDir,
            isShared: false,
          }),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || "Failed to save search");
          }
          return data;
        }),
        {
          loading: "Saving search...",
          success: "Search saved.",
          error: (err) => err?.message || "Failed to save search.",
        }
      );
    },
    [buildSearchFilters, sortDir, sortKey]
  );

  const handleResetSearch = useCallback(() => {
    setSearch("");
    if (advancedActive) {
      setAdvancedActive(false);
      setLoading(true);
      fetch("/api/admin/users/list", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      })
        .then(async (res) => {
          const json = await res.json().catch(() => null);
          if (!res.ok) {
            throw new Error((json as any)?.error || "Failed to load users");
          }
          const list: any[] = Array.isArray(json)
            ? json
            : Array.isArray((json as any)?.users)
            ? (json as any).users
            : [];
          setUsers(list as UserRecord[]);
        })
        .catch((err: any) => {
          const message = err?.message || "Unexpected error occurred.";
          setError(message);
          toastError(message);
          setUsers([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [advancedActive]);

  const handleDelete = async (uid: string) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to permanently delete this user? This action cannot be undone."
    );
    if (!confirmDelete) return;

    try {
      setDeletingUid(uid);
      await toastPromise(
        fetch("/api/admin/users/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid }),
          credentials: "include",
        }).then(async (res) => {
          const msg = await res.text().catch(() => "");
          if (!res.ok) {
            throw new Error(msg || "Failed to delete user");
          }
          return true;
        }),
        {
          loading: "Deleting user...",
          success: "User deleted successfully.",
          error: (err) => err?.message || "Failed to delete user.",
        }
      );

      setUsers((prev) => prev.filter((u) => getRowId(u) !== uid));
      if (selectedUid === uid) {
        setSelectedUid(null);
        setDrawerOpen(false);
      }
    } catch (e) {
      console.error("Error deleting user:", e);
    } finally {
      setDeletingUid((prev) => (prev === uid ? null : prev));
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const normalizeStatus = (value?: string) => {
    const raw = (value || "").trim().toLowerCase();
    if (!raw) return "Active";
    if (raw === "inactive" || raw === "disabled") return "Inactive";
    return "Active";
  };

  const getSortValue = (u: UserRecord, key: SortKey) => {
    const field =
      key === "name"
        ? u.name
        : key === "email"
        ? u.email
        : key === "phone"
        ? u.phone
        : key === "department"
        ? u.department
        : key === "status"
        ? normalizeStatus(u.status)
        : "";

    return (field || "").toString().toLowerCase();
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.trim().toLowerCase();
    return users.filter((u) =>
      [u.name, u.email, u.phone, u.department, normalizeStatus(u.status)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }, [users, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aVal: any = getSortValue(a, sortKey);
      const bVal: any = getSortValue(b, sortKey);

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const selectedUser =
    drawerOpen && selectedUid ? users.find((u) => getRowId(u) === selectedUid) || null : null;

  const openDrawer = (uid: string) => {
    if (!uid) return;
    setSelectedUid(uid);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedUid(null);
  };

  const handleResetMfa = async (uid: string) => {
    const confirmReset = window.confirm(
      "Reset MFA for this user? They will need to re-enroll with an authenticator app."
    );
    if (!confirmReset) return;

    try {
      setResettingMfaUid(uid);
      await toastPromise(
        fetch(`/api/admin/users/${uid}/mfa`, { method: "DELETE", credentials: "include" }).then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            throw new Error(data?.error || "Failed to reset MFA.");
          }
          return data;
        }),
        {
          loading: "Resetting MFA...",
          success: "MFA reset successfully.",
          error: (err) => err?.message || "Failed to reset MFA.",
        }
      );

      setUsers((prev) =>
        prev.map((user) => (getRowId(user) === uid ? { ...user, mfaEnabled: false } : user))
      );
    } catch (err: any) {
      console.error("Reset MFA error", err);
    } finally {
      setResettingMfaUid((prev) => (prev === uid ? null : prev));
    }
  };

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
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  // Regular body text (not bold)
  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.86)" : "rgba(15,23,42,0.85)",
    whiteSpace: "nowrap",
    fontWeight: 400,
  };

  // Stable header label: reserve slot for sort arrow so layout never shifts
  const headerLabel = (label: string, active?: boolean, dir?: SortDir) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      <span style={{ width: 14, display: "inline-block", textAlign: "center", opacity: active ? 1 : 0.35 }}>
        {active ? (dir === "asc" ? "▲" : "▼") : "•"}
      </span>
    </span>
  );

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">All Users</h1>

          <div className="page-subtitle" style={{ marginBottom: 18 }}>
            Manage all internal users. Search, sort, and open full HR details in the right-side drawer.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={() => setAdvancedOpen(true)}
            style={{ borderRadius: 999, padding: "10px 16px", fontWeight: 600 }}
          >
            🔍 Advanced Search
          </button>
          <LoadingButton
            type="button"
            className="btn"
            loading={creatingUser}
            loadingText="Opening..."
            onClick={() => {
              setCreatingUser(true);
              router.push("/admin/users/add");
            }}
            style={{ borderRadius: 999, padding: "10px 20px", fontWeight: 600 }}
          >
            + Create User
          </LoadingButton>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 16,
          background: isDark ? "rgba(24,24,24,0.9)" : "rgba(255,255,255,0.85)",
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
          boxShadow: isDark ? "0 14px 28px rgba(0,0,0,0.32)" : "0 12px 24px rgba(15,23,42,0.06)",
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1.3fr) repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search keyword"
          />
          <button
            type="button"
            className="btn"
            onClick={handleResetSearch}
            style={{ borderRadius: 999, padding: "8px 16px", fontWeight: 600 }}
          >
            {advancedActive ? "Reset Search" : "Reset Filters"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: isDark ? "rgba(226,232,240,0.75)" : "rgba(15,23,42,0.65)" }}>
          {loading ? "Loading..." : `${sorted.length} user(s)`}
        </div>
      </div>

      <div style={tableShellStyle}>
        {/* Loading state: keep table structure stable with skeletons. */}
        {loading ? (
          <SkeletonTable rows={6} columns={7} />
        ) : error ? (
          <p style={{ fontSize: 14, color: "#FCA5A5" }}>{error}</p>
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No users found"
            description="Create your first user to start managing access."
            action={{ label: "Create User", onClick: () => router.push("/admin/users/add") }}
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle} onClick={() => handleSort("name")}>
                    {headerLabel("Name", sortKey === "name", sortDir)}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("email")}>
                    {headerLabel("Email", sortKey === "email", sortDir)}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("phone")}>
                    {headerLabel("Phone", sortKey === "phone", sortDir)}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("department")}>
                    {headerLabel("Department", sortKey === "department", sortDir)}
                  </th>
                  <th style={headerCellStyle} onClick={() => handleSort("status")}>
                    {headerLabel("Status", sortKey === "status", sortDir)}
                  </th>
                  <th style={{ ...headerCellStyle, cursor: "default" }}>MFA</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", cursor: "default" }}>
                    {headerLabel("Action")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {sorted.map((u, idx) => {
                  const rowId = getRowId(u);

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
                      key={rowId || `${idx}`}
                      style={{ background: rowBg, transition: "background 120ms ease", cursor: "pointer" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = rowBg)}
                      onClick={() => openDrawer(rowId)}
                      title="View details"
                    >
                      <td style={cellStyle}>{u.name || "-"}</td>
                      <td style={cellStyle}>{u.email || "-"}</td>
                      <td style={cellStyle}>{u.phone || "-"}</td>
                      <td style={cellStyle}>{u.department || "-"}</td>
                      <td style={cellStyle}>{normalizeStatus(u.status)}</td>
                      <td style={cellStyle}>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            background: u.mfaEnabled ? "rgba(16,185,129,0.15)" : "rgba(148,163,184,0.2)",
                            color: u.mfaEnabled ? "#10b981" : isDark ? "#cbd5f5" : "#475569",
                          }}
                        >
                          {u.mfaEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrawer(rowId);
                            }}
                            className="btn ghost"
                            style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 500 }}
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AdvancedSearchDialog
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        module="users"
        fields={userSearchFields}
        onSearch={handleAdvancedSearch}
        onSave={handleSaveSearch}
      />

      {drawerOpen && selectedUser && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--sm" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  {selectedUser.name || "Untitled User"}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  {selectedUser.email || "No email"} · {(selectedUser.role || "No role").toString()}
                </div>
              </div>

              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            <UserDrawerContent
              user={selectedUser}
              isDark={isDark}
              deleting={deletingUid === getRowId(selectedUser)}
              onDelete={(id) => handleDelete(id)}
              onEdit={(id) => router.push(`/admin/users/${id}/edit`)}
              onResetMfa={(id) => handleResetMfa(id)}
              resettingMfa={resettingMfaUid === getRowId(selectedUser)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function UserDrawerContent({
  user,
  isDark,
  deleting,
  onDelete,
  onEdit,
  onResetMfa,
  resettingMfa,
}: {
  user: UserRecord;
  isDark: boolean;
  deleting: boolean;
  onDelete: (uid: string) => void;
  onEdit: (uid: string) => void;
  onResetMfa: (uid: string) => void;
  resettingMfa: boolean;
}) {
  const safe = (v: any) => (v === null || v === undefined || v === "" ? "-" : String(v));

  const formatPKR = (v: any) => {
    const num = Number(v);
    return isNaN(num) ? "-" : `Rs. ${num.toLocaleString("en-PK")}`;
  };

  const formatUSD = (v: any) => {
    const num = Number(v);
    return isNaN(num) ? "-" : `$ ${num.toLocaleString("en-US")}`;
  };

  const formatDate = (v: any) => {
    if (!v) return "-";
    const d = new Date(v);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-US");
  };

  const uid = getRowId(user);

  return (
    <>
      <Section title="Profile" isDark={isDark}>
        <Row label="Designation" value={safe(user.designation)} isDark={isDark} />
        <Row label="Role" value={safe(user.role)} isDark={isDark} />
        <Row label="Department" value={safe(user.department)} isDark={isDark} />
        <Row label="Joining Date" value={formatDate(user.joiningDate)} isDark={isDark} />
        <Row label="Status" value={safe(user.status)} isDark={isDark} />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="Compensation" isDark={isDark}>
        <Row label="Monthly Salary (PKR)" value={formatPKR(user.salary)} isDark={isDark} />
        <Row label="Monthly Target (USD)" value={formatUSD(user.monthlyTarget)} isDark={isDark} />
        <Row
          label="Commission (%)"
          value={user.commission !== undefined && user.commission !== null && user.commission !== "" ? `${user.commission}%` : "-"}
          isDark={isDark}
        />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="Identity" isDark={isDark}>
        <Row label="CNIC" value={safe(user.cnic)} isDark={isDark} />
        <Row label="Date of Birth" value={formatDate(user.dob)} isDark={isDark} />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="System" isDark={isDark}>
        <Row label="Created At" value={formatDate(user.createdAt)} isDark={isDark} />
        <Row label="Updated At" value={formatDate(user.updatedAt)} isDark={isDark} />
        <Row label="User ID" value={uid || "-"} isDark={isDark} />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="Security" isDark={isDark}>
        <Row label="MFA Status" value={user.mfaEnabled ? "Enabled" : "Disabled"} isDark={isDark} />
      </Section>

      <div style={{ height: 12 }} />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <LoadingButton
          type="button"
          className="btn"
          onClick={() => onResetMfa(uid)}
          loading={resettingMfa}
          loadingText="Resetting MFA..."
          style={{
            borderRadius: 12,
            fontWeight: 500,
            background: "rgba(59,130,246,0.1)",
            border: "1px solid rgba(59,130,246,0.35)",
            opacity: resettingMfa ? 0.7 : 1,
          }}
        >
          Reset MFA
        </LoadingButton>
        <button
          type="button"
          className="btn"
          onClick={() => onEdit(uid)}
          style={{ borderRadius: 12, fontWeight: 500 }}
        >
          Edit User
        </button>

        <LoadingButton
          type="button"
          className="btn"
          onClick={() => onDelete(uid)}
          loading={deleting}
          loadingText="Deleting..."
          style={{
            borderRadius: 12,
            fontWeight: 500,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            opacity: deleting ? 0.7 : 1,
            cursor: deleting ? "not-allowed" : "pointer",
            color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.86)",
          }}
        >
          Delete User
        </LoadingButton>
      </div>
    </>
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

function Row({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
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
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 500 }}>{label}</div>
      <div style={{ fontWeight: 500, textAlign: "right" }}>{value}</div>
    </div>
  );
}
