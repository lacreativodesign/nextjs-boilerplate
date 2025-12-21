"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

type UserRecord = {
  uid: string;
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  salary?: number;
  dob?: string;
  createdAt?: string;
};

type SortKey = "name" | "email" | "role" | "department" | "createdAt";
type SortDir = "asc" | "desc";

export default function UsersPage() {
  const router = useRouter();
  const isDark = useIsDarkMode();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UserRecord[]>([]);
  const [query, setQuery] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/users/list", {
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json();
        if (!res.ok || !Array.isArray(json?.users)) throw new Error();

        if (alive) setRows(json.users);
      } catch {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((u) =>
      [u.name, u.email, u.role, u.department].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortKey] || "";
      const bv = (b as any)[sortKey] || "";
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  const sortBadge = (k: SortKey) =>
    k !== sortKey ? "" : sortDir === "asc" ? "▲" : "▼";

  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, marginBottom: 8 }}>
        Users
      </h1>

      <div className="mut" style={{ marginBottom: 18 }}>
        Manage internal team members, roles, departments, and access.
      </div>

      <div style={{ marginBottom: 16, maxWidth: 360 }}>
        <input
          className="input"
          placeholder="Search keyword"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="erp-table-shell">
        {loading ? (
          <p>Loading users…</p>
        ) : sorted.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="erp-th" onClick={() => toggleSort("name")}>
                    <div className="th-flex">
                      Name <span className="sort-slot">{sortBadge("name")}</span>
                    </div>
                  </th>
                  <th className="erp-th" onClick={() => toggleSort("email")}>
                    <div className="th-flex">
                      Email <span className="sort-slot">{sortBadge("email")}</span>
                    </div>
                  </th>
                  <th className="erp-th" onClick={() => toggleSort("role")}>
                    <div className="th-flex">
                      Role <span className="sort-slot">{sortBadge("role")}</span>
                    </div>
                  </th>
                  <th className="erp-th" onClick={() => toggleSort("department")}>
                    <div className="th-flex">
                      Department <span className="sort-slot">{sortBadge("department")}</span>
                    </div>
                  </th>
                  <th className="erp-th" onClick={() => toggleSort("createdAt")}>
                    <div className="th-flex">
                      Created <span className="sort-slot">{sortBadge("createdAt")}</span>
                    </div>
                  </th>
                  <th className="erp-th no-sort" style={{ textAlign: "right" }}>
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {sorted.map((u, idx) => (
                  <tr
                    key={u.uid}
                    className={`erp-row-hover ${idx % 2 === 0 ? "erp-row-even" : "erp-row-odd"}`}
                  >
                    <td className="erp-td">{u.name || "-"}</td>
                    <td className="erp-td">{u.email || "-"}</td>
                    <td className="erp-td">{u.role || "-"}</td>
                    <td className="erp-td">{u.department || "-"}</td>
                    <td className="erp-td">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}
                    </td>
                    <td className="erp-td erp-action">
                      <button
                        className="erp-action-btn"
                        onClick={() => router.push(`/admin/users/${u.uid}/edit`)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        )}
      </div>
    </div>
  );
}
