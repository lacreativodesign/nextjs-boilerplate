"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function UserDetailsPage() {
  const { uid } = useParams();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newRole, setNewRole] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/get-user?uid=${uid}`, {
          method: "GET",
          credentials: "include",
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        setUser(data.user);
        setNewRole(data.user.role);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [uid]);

  async function updateRole() {
    try {
      const res = await fetch(`/api/admin/update-user`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, role: newRole }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert("Role updated successfully!");
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function resetPassword() {
    try {
      const res = await fetch(`/api/admin/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert("Password reset email sent.");
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function deleteUser() {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      const res = await fetch(`/api/admin/delete-user`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert("User deleted successfully.");
      window.location.href = "/admin/view-users";
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "Inter, sans-serif",
        backgroundColor: "#f9fafb",
        padding: "40px",
      }}
    >
      <h1
        style={{
          fontSize: "28px",
          fontWeight: 700,
          marginBottom: "20px",
          color: "#111827",
        }}
      >
        User Details
      </h1>

      {loading && <p style={{ color: "#6b7280" }}>Loading user...</p>}
      {error && (
        <p
          style={{
            background: "#fee2e2",
            color: "#b91c1c",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "20px",
          }}
        >
          {error}
        </p>
      )}

      {user && (
        <div
          style={{
            background: "white",
            padding: "30px",
            borderRadius: "12px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
            maxWidth: "600px",
          }}
        >
          <p style={field}>
            <strong>Name:</strong> {user.name}
          </p>

          <p style={field}>
            <strong>Email:</strong> {user.email}
          </p>

          <p style={field}>
            <strong>Role:</strong> {user.role}
          </p>

          {/* Edit Role */}
          <div style={{ marginTop: "20px" }}>
            <label style={{ fontWeight: 600 }}>Change Role:</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
              }}
            >
              <option value="admin">Admin</option>
              <option value="sales">Sales</option>
              <option value="am">Account Manager</option>
              <option value="production">Production</option>
              <option value="hr">HR</option>
              <option value="finance">Finance</option>
              <option value="client">Client</option>
            </select>

            <button onClick={updateRole} style={saveBtn}>
              Save Role
            </button>
          </div>

          <hr style={{ margin: "30px 0" }} />

          {/* Reset Password */}
          <button onClick={resetPassword} style={actionBtn}>
            Reset Password
          </button>

          {/* Delete User */}
          <button
            onClick={deleteUser}
            style={{ ...actionBtn, background: "#ef4444", marginTop: "10px" }}
          >
            Delete User
          </button>
        </div>
      )}
    </div>
  );
}

const field = {
  fontSize: "16px",
  color: "#374151",
  marginBottom: "12px",
};

const saveBtn = {
  marginTop: "12px",
  padding: "10px 18px",
  background: "#06b6d4",
  color: "white",
  borderRadius: "8px",
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
};

const actionBtn = {
  width: "100%",
  padding: "12px",
  background: "#3b82f6",
  color: "white",
  borderRadius: "8px",
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
};
