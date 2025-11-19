"use client";

import React, { useEffect, useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

type RoleCounts = {
  [role: string]: number;
};

export default function AdminOverviewPage() {
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [roleCounts, setRoleCounts] = useState<RoleCounts>({});
  const [presentToday, setPresentToday] = useState<number>(0);
  const [absentToday, setAbsentToday] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadStats() {
      try {
        // 1) Fetch users from admin list-users API
        const usersRes = await fetch("/api/admin/list-users", {
          method: "GET",
          credentials: "include",
        });

        let users: any[] = [];
        if (usersRes.ok) {
          const data = await usersRes.json();
          // Try to be defensive about shape
          users = (data.users as any[]) || (data as any[]) || [];
        }

        const total = users.length;
        setTotalUsers(total);

        // Count by role
        const counts: RoleCounts = {};
        users.forEach((u: any) => {
          const role = u.role || u.customClaims?.role || "unknown";
          counts[role] = (counts[role] || 0) + 1;
        });
        setRoleCounts(counts);

        // 2) Fetch attendance for today (if API is wired)
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const dateParam = `${yyyy}-${mm}-${dd}`;

        const attendanceRes = await fetch(
          `/api/hr/attendance/list?date=${dateParam}`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        let present = 0;
        if (attendanceRes.ok) {
          const attData = await attendanceRes.json();
          const records: any[] =
            (attData.records as any[]) ||
            (attData.attendance as any[]) ||
            (Array.isArray(attData) ? attData : []);

          // Try different possible shapes but never crash
          records.forEach((r: any) => {
            if (
              r.status === "present" ||
              r.status === "Present" ||
              r.isPresent === true
            ) {
              present += 1;
            }
          });
        }

        setPresentToday(present);
        // If we know total users, compute absentees roughly
        if (total > 0) {
          setAbsentToday(Math.max(total - present, 0));
        } else {
          setAbsentToday(0);
        }
      } catch (err) {
        // Fail silently on the UI – just mark as loaded
        console.error("Error loading admin stats", err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  const cards = [
    {
      title: "Total Users",
      value: loading ? "…" : totalUsers,
      subtitle: "All active accounts in the ERP",
    },
    {
      title: "Users by Role",
      value: loading
        ? "Loading…"
        : Object.keys(roleCounts).length === 0
        ? "No roles yet"
        : "",
      customContent:
        !loading && Object.keys(roleCounts).length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 12,
            }}
          >
            {Object.entries(roleCounts).map(([role, count]) => (
              <span
                key={role}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  border: "1px solid #bfdbfe",
                }}
              >
                {role}: {count}
              </span>
            ))}
          </div>
        ) : null,
      subtitle: "Admin, Sales, Sales Manager, HR, AM, Production, Client…",
    },
    {
      title: "Present Today",
      value: loading ? "…" : presentToday,
      subtitle: "Based on today’s logins",
    },
    {
      title: "Absent Today",
      value: loading ? "…" : absentToday,
      subtitle: "Users with no login record today",
    },
  ];

  return (
    <ERPLayout role="admin" title="Admin Overview">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Heading */}
        <div>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Company Control Center
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "#6b7280",
            }}
          >
            High-level snapshot of users, roles, and daily attendance.
          </p>
        </div>

        {/* KPI Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {cards.map((card) => (
            <div
              key={card.title}
              style={{
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                padding: 16,
                background: "#ffffff",
                boxShadow: "0 2px 5px rgba(0,0,0,0.03)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#6b7280",
                }}
              >
                {card.title}
              </span>
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#111827",
                }}
              >
                {card.value}
              </span>
              {card.customContent}
              <span
                style={{
                  fontSize: 12,
                  color: "#9ca3af",
                  marginTop: 4,
                }}
              >
                {card.subtitle}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ERPLayout>
  );
          }
