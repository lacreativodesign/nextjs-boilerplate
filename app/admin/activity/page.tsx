"use client";

import { useEffect, useState } from "react";

export default function AdminActivityPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/activity/list", {
          cache: "no-store",
        });
        const data = await res.json();
        setLogs(data);
      } catch (e) {
        console.error("Failed to load activity:", e);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20 }}>
        Activity Log
      </h2>

      <p style={{ fontSize: 16, color: "var(--sidebar-text)" }}>
        System-wide admin actions & audit tracking.
      </p>

      {loading ? (
        <p style={{ color: "#666", marginTop: 30 }}>Loading...</p>
      ) : logs.length === 0 ? (
        <p style={{ color: "#999", marginTop: 30 }}>No activity found.</p>
      ) : (
        <div
          style={{
            marginTop: 30,
            background: "var(--card-bg)",
            borderRadius: 10,
            padding: 20,
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "grid", gap: 20 }}>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: 15,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <p style={{ fontSize: 15, fontWeight: 600 }}>
                  {log.message}
                </p>
                <p style={{ fontSize: 13, color: "#777", marginTop: 4 }}>
                  {new Date(log.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
            }
