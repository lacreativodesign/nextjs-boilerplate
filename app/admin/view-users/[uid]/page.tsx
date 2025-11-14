"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";

export default function AdminViewSingleUser() {
  const { uid } = useParams();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUser() {
      try {
        if (!uid) return;

        const ref = doc(db, "users", uid as string);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("User profile not found.");
          return;
        }

        setUser(snap.data());
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load user");
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [uid]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f9fafb",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* TOP BAR — same theme */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 40px",
          backgroundColor: "#111827",
          color: "white",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>
            User Details
          </h1>
          <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
            Viewing complete profile for the selected user.
          </p>
        </div>

        <button
          onClick={() => (window.location.href = "/admin/view-users")}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "#374151",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          ← Back to Users
        </button>
      </header>

      {/* MAIN CONTENT */}
      <main
        style={{
          flex: 1,
          padding: "40px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 600,
            background: "white",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
            padding: 30,
          }}
        >
          {loading && (
            <p style={{ fontSize: 14, color: "#6b7280" }}>
              Loading user profile…
            </p>
          )}

          {error && (
            <p style={{ fontSize: 14, color: "#b91c1c" }}>
              {error}
            </p>
          )}

          {!loading && !error && user && (
            <>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  marginBottom: 20,
                  color: "#111827",
                }}
              >
                {user.name || "Unnamed User"}
              </h2>

              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: "#374151" }}>Email:</strong>
                <p style={{ color: "#6b7280", marginTop: 4 }}>
                  {user.email}
                </p>
              </div>

              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: "#374151" }}>Role:</strong>
                <p style={{ color: "#6b7280", marginTop: 4 }}>
                  {user.role?.toUpperCase()}
                </p>
              </div>

              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: "#374151" }}>UID:</strong>
                <p style={{ color: "#6b7280", marginTop: 4 }}>
                  {uid}
                </p>
              </div>

              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: "#374151" }}>Created At:</strong>
                <p style={{ color: "#6b7280", marginTop: 4 }}>
                  {user.createdAt
                    ? new Date(user.createdAt).toLocaleString()
                    : "—"}
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
