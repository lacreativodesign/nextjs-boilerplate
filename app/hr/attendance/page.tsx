"use client";

import { useEffect, useState } from "react";

export default function AttendancePage() {
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/hr/attendance/list");
        if (!res.ok) throw new Error("Failed to fetch attendance");

        const data = await res.json();
        setAttendance(data || []);
      } catch (err: any) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return (
    <div style={{ padding: "2rem" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "600" }}>Attendance</h1>

      {loading && <p>Loading attendance...</p>}

      {error && (
        <p style={{ color: "red", marginTop: "10px" }}>
          Error: {error}
        </p>
      )}

      {!loading && !error && (
        <div style={{ marginTop: "20px" }}>
          {attendance.length === 0 ? (
            <p>No attendance logs found.</p>
          ) : (
            <ul>
              {attendance.map((item, i) => (
                <li key={i}>
                  {item.userId} — {item.type} — {item.timestamp}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** ---------------------------
 *  UTILITY: Compute Total Hours
 *  ---------------------------
 */
function computeHours(logs: any[]) {
  let totalMs = 0;

  for (let i = 0; i < logs.length; i++) {
    if (logs[i].type === "login") {
      const logoutEvent = logs.find(
        (l: any) =>
          l.type === "logout" &&
          new Date(l.timestamp) > new Date(logs[i].timestamp)
      );

      if (logoutEvent) {
        const diff =
          new Date(logoutEvent.timestamp).getTime() -
          new Date(logs[i].timestamp).getTime();
        totalMs += diff;
      }
    }
  }

  const hrs = totalMs / (1000 * 60 * 60);
  return hrs.toFixed(2);
    }
