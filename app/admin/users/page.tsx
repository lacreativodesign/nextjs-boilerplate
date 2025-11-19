"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function UserListPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/users/list");
      const data = await res.json();
      setUsers(data.users || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p>Loading users...</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 26, fontWeight: 700 }}>User Management</h2>

        <Link
          href="/admin/users/create"
          style={{
            background: "#2563eb",
            color: "white",
            padding: "10px 18px",
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          + Create User
        </Link>
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "var(--header-bg)" }}>
            <tr>
              {["Name", "Email", "Role", "Status", "Actions"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: 14,
                    textAlign: "left",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {users.map((u) => (
              <tr key={u.uid}>
                <td style={{ padding: 14 }}>{u.name}</td>
                <td style={{ padding: 14 }}>{u.email}</td>
                <td style={{ padding: 14, textTransform: "capitalize" }}>{u.role}</td>
                <td style={{ padding: 14 }}>{u.disabled ? "Disabled" : "Active"}</td>

                <td style={{ padding: 14 }}>
                  <Link
                    href={`/admin/users/${u.uid}`}
                    style={{
                      background: "#0ea5e9",
                      padding: "6px 12px",
                      color: "white",
                      borderRadius: 6,
                      marginRight: 10,
                      textDecoration: "none",
                      fontSize: 14,
                    }}
                  >
                    Edit
                  </Link>

                  <button
                    onClick={async () => {
                      if (!confirm("Are you sure?")) return;

                      await fetch("/api/admin/users/delete", {
                        method: "POST",
                        body: JSON.stringify({ uid: u.uid }),
                      });

                      window.location.reload();
                    }}
                    style={{
                      background: "#ef4444",
                      padding: "6px 12px",
                      color: "white",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {users.length === 0 && (
              <tr>
                <td style={{ padding: 20 }} colSpan={5}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
        }
