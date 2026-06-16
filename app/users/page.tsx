"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";
import LoadingButton from "@/components/ui/LoadingButton";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { SmartSearchBar } from "@/components/search/SmartSearchBar";
import { toastError, toastPromise } from "@/lib/toast";
import { apiFetch } from "@/lib/api/client";

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

/** Always get a usable ID no matter what your API returns */
const getRowId = (u: any) =>
  (u?.uid || u?.id || u?.docId || u?.userId || u?.firebaseUid || u?.email || "") as string;


export default function UsersPage() {

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

  const router = useRouter();

  // Default list load (used on mount and when the search term is cleared).
  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const res = await apiFetch("/api/admin/users/list", {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error((json as any)?.error || "Failed to load users");
      }

      // Supports BOTH:
      // 1) API returns array: [...]
      // 2) API returns object: { ok: true, users: [...] }
      const list: any[] = Array.isArray(json) ? json : Array.isArray((json as any)?.users) ? (json as any).users : [];

      setUsers(list as UserRecord[]);
    } catch (err: any) {
      const message = err?.message || "Unexpected error occurred.";
      setError(message);
      toastError(message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Server-side full-text search driven by the SmartSearchBar.
  const runSearch = useCallback(async () => {
    const term = search.trim();
    if (!term) {
      loadList();
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await apiFetch("/api/users/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchText: term,
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
    } catch (err: any) {
      const message = err?.message || "Failed to search users";
      setError(message);
      toastError(message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search, sortDir, sortKey, loadList]);

  // Clearing the term (including the × button) reloads the full list.
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (!value.trim()) {
        loadList();
      }
    },
    [loadList]
  );

  const handleDelete = async (uid: string) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to permanently delete this user? This action cannot be undone."
    );
    if (!confirmDelete) return;

    try {
      setDeletingUid(uid);
      await toastPromise(
        apiFetch("/api/admin/users/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid }),
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

  const sorted = useMemo(() => {
    const arr = [...users];
    arr.sort((a, b) => {
      const aVal: any = getSortValue(a, sortKey);
      const bVal: any = getSortValue(b, sortKey);

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [users, sortKey, sortDir]);

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
        apiFetch(`/api/admin/users/${uid}/mfa`, { method: "DELETE" }).then(async (res) => {
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


  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-subtle)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  // Regular body text (not bold)
  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: "1px dashed var(--border-subtle)",
    color: "var(--text-primary)",
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
      <div className="mb-6">
        <h1 className="page-title">Users</h1>
        <p className="page-subtitle">Manage team members, roles, and access.</p>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div style={{ display: "flex", gap: 10 }}>
          <LoadingButton
            type="button"
            className="btn"
            loading={creatingUser}
            loadingText="Opening..."
            onClick={() => {
              setCreatingUser(true);
              router.push("/users/add");
            }}
            style={{ borderRadius: 999, padding: "10px 20px", fontWeight: 600 }}
          >
            + Add User
          </LoadingButton>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {loading ? "Loading..." : `${sorted.length} user(s)`}
        </div>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 16,
          background: "var(--surface-card)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-md)",
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1.3fr) repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          alignItems: "center",
        }}
      >
        <SmartSearchBar value={search} onChange={handleSearchChange} onSubmit={runSearch} />
      </div>

      <div className="table-shell">
        <div>
        {/* Loading state: keep table structure stable with skeletons. */}
        {loading ? (
          <SkeletonTable rows={6} columns={7} />
        ) : error ? (
          <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)] mb-4">{error}</div>
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No users found"
            description="Create your first user to start managing access."
            action={{ label: "Create User", onClick: () => router.push("/users/add") }}
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}><button className="table-sort" onClick={() => handleSort("name")}>{headerLabel("Name", sortKey === "name", sortDir)}</button></th>
                  <th style={headerCellStyle}><button className="table-sort" onClick={() => handleSort("email")}>{headerLabel("Email", sortKey === "email", sortDir)}</button></th>
                  <th style={headerCellStyle}><button className="table-sort" onClick={() => handleSort("phone")}>{headerLabel("Phone", sortKey === "phone", sortDir)}</button></th>
                  <th style={headerCellStyle}><button className="table-sort" onClick={() => handleSort("department")}>{headerLabel("Department", sortKey === "department", sortDir)}</button></th>
                  <th style={headerCellStyle}><button className="table-sort" onClick={() => handleSort("status")}>{headerLabel("Status", sortKey === "status", sortDir)}</button></th>
                  <th style={{ ...headerCellStyle, cursor: "default" }}>MFA</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", cursor: "default" }}>
                    {headerLabel("Action")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {sorted.map((u, idx) => {
                  const rowId = getRowId(u);

                  return (
                    <tr
                      key={rowId || `${idx}`}
                      style={{ cursor: "pointer" }}
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
                            color: u.mfaEnabled ? "#10b981" : "var(--text-muted)",
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
      </div>

      {drawerOpen && selectedUser && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--sm" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)" }}>
                  {selectedUser.name || "Untitled User"}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: "var(--text-muted)" }}>
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
              deleting={deletingUid === getRowId(selectedUser)}
              onDelete={(id) => handleDelete(id)}
              onEdit={(id) => router.push(`/users/${id}/edit`)}
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
  deleting,
  onDelete,
  onEdit,
  onResetMfa,
  resettingMfa,
}: {
  user: UserRecord;
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
      <Section title="Profile">
        <Row label="Designation" value={safe(user.designation)} />
        <Row label="Role" value={safe(user.role)} />
        <Row label="Department" value={safe(user.department)} />
        <Row label="Joining Date" value={formatDate(user.joiningDate)} />
        <Row label="Status" value={safe(user.status)} />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="Compensation">
        <Row label="Monthly Salary (PKR)" value={formatPKR(user.salary)} />
        <Row label="Monthly Target (USD)" value={formatUSD(user.monthlyTarget)} />
        <Row
          label="Commission (%)"
          value={user.commission !== undefined && user.commission !== null && user.commission !== "" ? `${user.commission}%` : "-"}
         
        />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="Identity">
        <Row label="CNIC" value={safe(user.cnic)} />
        <Row label="Date of Birth" value={formatDate(user.dob)} />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="System">
        <Row label="Created At" value={formatDate(user.createdAt)} />
        <Row label="Updated At" value={formatDate(user.updatedAt)} />
        <Row label="User ID" value={uid || "-"} />
      </Section>

      <div style={{ height: 12 }} />

      <Section title="Security">
        <Row label="MFA Status" value={user.mfaEnabled ? "Enabled" : "Disabled"} />
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
            color: "var(--text-primary)",
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
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        background: "var(--surface-muted)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
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
