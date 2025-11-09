"use client";

import React, { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import {
  db,
  fetchUserRole,
  auth
} from "@/lib/firebaseClient";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy
} from "firebase/firestore";
import { signOut } from "firebase/auth";

export default function AdminPage() {
  const [dark, setDark] = useState(false);

  const theme = {
    bg: dark ? "#0F172A" : "#F8FAFC",
    card: dark ? "#1E293B" : "#FFFFFF",
    text: dark ? "#F1F5F9" : "#0F172A",
    muted: dark ? "#94A3B8" : "#475569",
    border: dark ? "#334155" : "#E2E8F0",
    sidebar: dark ? "#1E293B" : "#FFFFFF"
  };

  // ===== FIRESTORE DATA =====
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    // ✅ Load Projects
    const projSnap = await getDocs(
      query(collection(db, "projects"), orderBy("updatedAt", "desc"))
    );

    const projList = projSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    setProjects(projList);

    // ✅ Load Clients
    const clientSnap = await getDocs(
      query(collection(db, "users"), where("role", "==", "client"))
    );
    setClients(clientSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));

    // ✅ Load Team members
    const teamSnap = await getDocs(
      query(
        collection(db, "users"),
        where("role", "in", ["admin", "sales", "am", "hr", "production"])
      )
    );
    setTeam(teamSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));

    setLoading(false);
  }

  // ===== KPI DATA =====
  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status !== "Delivered").length;
  const totalClients = clients.length;
  const totalTeam = team.length;

  return (
    <RequireAuth allowed={["admin"]}>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          background: theme.bg,
          color: theme.text,
          fontFamily: "Inter, sans-serif",
        }}
      >

        {/* ===== SIDEBAR ===== */}
        <aside
          style={{
            width: 240,
            background: theme.sidebar,
            borderRight: `1px solid ${theme.border}`,
            padding: "26px 18px",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              marginBottom: 30,
              color: "#06B6D4",
            }}
          >
            ADMIN PANEL
          </div>

          {[
            "Overview",
            "Team Analytics",
            "Hierarchy",
            "Activity",
            "Projects",
            "Clients",
            "Team",
            "Finance",
            "Reports",
            "Settings",
          ].map((item) => (
            <div
              key={item}
              style={{
                padding: "10px 12px",
                marginBottom: 6,
                borderRadius: 10,
                cursor: "pointer",
                color: theme.muted,
                fontWeight: 600,
              }}
            >
              {item}
            </div>
          ))}

          {/* Dark/Light */}
          <button
            onClick={() => setDark(!dark)}
            style={{
              marginTop: 30,
              width: "100%",
              padding: 10,
              borderRadius: 10,
              background: "transparent",
              border: `1px solid ${theme.border}`,
              color: theme.text,
              cursor: "pointer",
            }}
          >
            {dark ? "Light Mode" : "Dark Mode"}
          </button>

          {/* Logout */}
          <button
            onClick={() => signOut(auth)}
            style={{
              marginTop: 10,
              width: "100%",
              padding: 10,
              borderRadius: 10,
              background: "#DC2626",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Logout
          </button>
        </aside>

        {/* ===== MAIN CONTENT ===== */}
        <main style={{ flex: 1, padding: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>
            Admin Overview
          </h1>

          {/* ===== KPI CARDS ===== */}
          <div style={{ display: "flex", gap: 20, marginBottom: 30 }}>
            {[
              { label: "Total Projects", value: totalProjects },
              { label: "Active Projects", value: activeProjects },
              { label: "Clients", value: totalClients },
              { label: "Team Members", value: totalTeam },
            ].map((k) => (
              <div
                key={k.label}
                style={{
                  flex: 1,
                  background: theme.card,
                  padding: 20,
                  borderRadius: 16,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ fontSize: 14, color: theme.muted }}>
                  {k.label}
                </div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 900,
                    marginTop: 6,
                    color: "#06B6D4",
                  }}
                >
                  {k.value}
                </div>
              </div>
            ))}
          </div>

          {/* ===== PROJECTS TABLE ===== */}
          <div
            style={{
              background: theme.card,
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              Recent Projects
            </h2>

            {loading ? (
              <div>Loading…</div>
            ) : (
              projects.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: "14px 0",
                    borderBottom: `1px solid ${theme.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: theme.muted }}>
                      {p.status} • {p.files || 0} Files
                    </div>
                  </div>
                  <button
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: "#06B6D4",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    View
                  </button>
                </div>
              ))
            )}
          </div>

          {/* ===== TEAM + CLIENTS ===== */}
          <div
            style={{
              display: "flex",
              gap: 20,
            }}
          >
            <div
              style={{
                flex: 1,
                background: theme.card,
                padding: 20,
                borderRadius: 16,
                border: `1px solid ${theme.border}`,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
                Team Members
              </h2>

              {team.slice(0, 5).map((t) => (
                <div
                  key={t.id}
                  style={{
                    padding: "12px 0",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  {t.name} — {t.role.toUpperCase()}
                </div>
              ))}
            </div>

            <div
              style={{
                flex: 1,
                background: theme.card,
                padding: 20,
                borderRadius: 16,
                border: `1px solid ${theme.border}`,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
                Clients
              </h2>

              {clients.slice(0, 5).map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "12px 0",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  {c.name} — {c.email}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
            }
