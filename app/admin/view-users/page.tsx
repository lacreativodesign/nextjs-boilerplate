"use client";

import React, { useEffect, useState } from "react";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";

export default function AdminViewUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadUsers() {
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(list);
    } catch (err: any) {
      setError(err.message || "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleDelete(uid: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      await deleteDoc(doc(db, "users", uid));
      alert("User deleted successfully");
      loadUsers();
    } catch (err) {
      alert("Failed to delete user");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f9fafb",
        fontFamily: "Inter, sans-serif",
        padding: "40px",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>
        All Users
      </h1>

      {loading && <p>Loading users...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && (
        <table
          style={{
            width: "100%",
            background: "white",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
          }}
        >
          <thead style={{ background: "#111827", color: "white" }}>
            <tr>
              <th style={{ padding: 14, textAlign: "left" }}>Name</th>
              <th style={{ padding: 14, textAlign: "left" }}>Email</th>
              <th style={{ padding: 14, textAlign: "left" }}>Role</th>
              <th style={{ padding: 14, textAlign: "left" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: 14 }}>{u.name}</td>
                <td style={{ padding: 14 }}>{u.email}</td>
                <td style={{ padding: 14 }}>{u.role.toUpperCase()}</td>

                <td style={{ padding: 14, display: "flex", gap: "10px" }}>
                  
                  {/* VIEW BUTTON */}
                  <button
                    onClick={() =>
                      (window.location.href = `/admin/view-users/${u.id}`)
                    }
                    style={{
                      padding: "8px 14px",
                      background: "#3b82f6",
                      borderRadius: 6,
                      border: "none",
                      color: "white",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    VIEW
                  </button>

                  {/* EDIT BUTTON */}
                  <button
                    onClick={() =>
                      (window.location.href = `/admin/edit-user/${u.id}`)
                    }
                    style={{
                      padding: "8px 14px",
                      background: "#f59e0b",
                      borderRadius: 6,
                      border: "none",
                      color: "white",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    EDIT
                  </button>

                  {/* DELETE BUTTON */}
                  <button
                    onClick={() => handleDelete(u.id)}
                    style={{
                      padding: "8px 14px",
                      background: "#ef4444",
                      borderRadius: 6,
                      border: "none",
                      color: "white",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    DELETE
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
