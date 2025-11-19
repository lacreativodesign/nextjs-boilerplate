"use client";

import { useEffect, useState } from "react";

export default function ActivityPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/activity/list");
        if (!res.ok) return;
        const data = await res.json();
        setLogs(data.logs);
      } catch (e) {
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20 }}>
        Activity Log
      </h2>

      <div
        style={{
          background: "white",
          padding: 20,
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
      >
        {loading ? (
          <p>Loading activity...</p>
        ) : logs.length === 0 ? (
          <p>No recent activity.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                <th style={{ padding: 10 }}>Action</th>
                <th style={{ padding: 10 }}>Actor</th>
                <th style={{ padding: 10 }}>Target</th>
                <th style={{ padding: 10 }}>Details</th>
                <th style={{ padding: 10 }}>Timestamp</th>
              </tr>
            </thead>

            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  style={{ borderBottom: "1px solid #e5e7eb" }}
                >
                  <td style={{ padding: 10 }}>{log.action}</td>
                  <td style={{ padding: 10 }}>
                    {log.actorRole} ({log.actorUid})
                  </td>
                  <td style={{ padding: 10 }}>
                    {log.targetUid || "-"}
                  </td>
                  <td style={{ padding: 10, fontSize: 12 }}>
                    {JSON.stringify(log.details || {}, null, 2)}
                  </td>
                  <td style={{ padding: 10 }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
            }
