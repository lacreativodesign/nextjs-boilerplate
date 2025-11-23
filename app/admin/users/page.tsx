"use client";

import { useEffect, useMemo, useState } from "react";

type UserRecord = {
  uid: string;
  name?: string;
  email: string;
  role: string;
  disabled?: boolean;
  status?: string;

  phone?: string;
  cnic?: string;
  address?: string;
  city?: string;
  country?: string;
  dob?: string;
  joiningDate?: string;
  salary?: number;
  targetMonthly?: number;
  department?: string;

  createdAt?: string;
  lastLoginAt?: string;
};

type SortKey = "name" | "email" | "role" | "status" | "joiningDate" | "createdAt";

export default function UsersPage() {
  return (
    <div>
      <AllUsersSection />
    </div>
  );
}

/* ===========================================
      ALL USERS TABLE (FINAL + CLEAN)
=========================================== */
function AllUsersSection() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/users/list", {
          method: "GET",
          credentials: "include",
        });
        const data = await res.json();
        setUsers(data.users || []);
      } catch {
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedUsers = useMemo(() => {
    const sorted = [...users];
    sorted.sort((a, b) => {
      const A = (a as any)[sortKey] || "";
      const B = (b as any)[sortKey] || "";
      return sortDir === "asc"
        ? String(A).localeCompare(String(B))
        : String(B).localeCompare(String(A));
    });
    return sorted;
  }, [users, sortKey, sortDir]);

  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>All Users</h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)", marginBottom: 16 }}>
        Full employee list with sorting + expandable details row.
      </p>

      {loading ? (
        <p>Loading users...</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <SortableTh label="Name" thKey="name" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortableTh label="Email" thKey="email" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortableTh label="Role" thKey="role" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortableTh label="Status" thKey="status" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortableTh
                  label="Joining Date"
                  thKey="joiningDate"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={toggleSort}
                />
                <th style={{ padding: "8px 4px" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sortedUsers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12 }}>
                    No users found yet.
                  </td>
                </tr>
              )}

              {sortedUsers.map((u) => {
                const open = expandedUid === u.uid;
                return (
                  <>
                    <tr key={u.uid} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 4px" }}>{u.name || "-"}</td>
                      <td style={{ padding: "8px 4px" }}>{u.email}</td>
                      <td style={{ padding: "8px 4px" }}>{u.role}</td>
                      <td style={{ padding: "8px 4px" }}>{u.disabled ? "Disabled" : u.status || "Active"}</td>
                      <td style={{ padding: "8px 4px" }}>
                        {u.joiningDate ? new Date(u.joiningDate).toLocaleDateString() : "-"}
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <button
                          onClick={() => setExpandedUid(open ? null : u.uid)}
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "#f3f4f6",
                          }}
                        >
                          {open ? "Hide" : "View More"}
                        </button>
                      </td>
                    </tr>

                    {open && (
                      <tr>
                        <td colSpan={6} style={{ background: "var(--page-bg)", padding: 14 }}>
                          <ExpandedUser user={u} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ===========================================
      EXPANDED ROW (FULL PROFILE)
=========================================== */
function ExpandedUser({ user }: { user: UserRecord }) {
  const fields = [
    { label: "Phone", value: user.phone },
    { label: "CNIC", value: user.cnic },
    { label: "Address", value: user.address },
    { label: "City", value: user.city },
    { label: "Country", value: user.country },
    { label: "Department", value: user.department },
    { label: "Salary", value: user.salary ? `Rs. ${user.salary}` : null },
    { label: "Target Monthly", value: user.targetMonthly ? `Rs. ${user.targetMonthly}` : null },
    { label: "DOB", value: user.dob ? new Date(user.dob).toLocaleDateString() : null },
    { label: "Created At", value: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : null },
    { label: "Last Login", value: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : null },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
      {fields.map((f) => (
        <div
          key={f.label}
          style={{
            border: "1px solid var(--border)",
            padding: 10,
            borderRadius: 8,
            background: "var(--card-bg)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>{f.label}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{f.value || "-"}</div>
        </div>
      ))}
    </div>
  );
}

/* ===========================================
      SORTABLE HEADER COMPONENT
=========================================== */
function SortableTh({ label, thKey, activeKey, dir, onClick }: any) {
  const active = thKey === activeKey;
  return (
    <th
      onClick={() => onClick(thKey)}
      style={{
        padding: "8px 4px",
        cursor: "pointer",
        fontWeight: active ? 700 : 600,
        color: active ? "#fff" : "var(--sidebar-text)",
      }}
    >
      {label} {active ? (dir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}
