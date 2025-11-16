"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface UserRecord {
  uid: string;
  name: string;
  email: string;
  role: string;
}

export default function EditUserPage() {
  const { uid } = useParams();
  const router = useRouter();

  const [form, setForm] = useState<UserRecord>({
    uid: "",
    name: "",
    email: "",
    role: "client",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadUser() {
    try {
      const res = await fetch(`/api/admin/get-user?uid=${uid}`, {
        method: "GET",
        credentials: "include",
      });

      const data = await res.json();

      if (res.ok && data.user) {
        setForm({
          uid: data.user.uid,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
        });
      }
    } catch (err) {
      console.error("Failed to load user:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (uid) loadUser();
  }, [uid]);

  async function handleSubmit(e: any) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch("/api/admin/update-user", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify(form),
    });

    setSaving(false);

    if (res.ok) {
      alert("User updated successfully!");
      router.push(`/admin/view-users/${uid}`);
    } else {
      alert("Failed to update user.");
    }
  }

  if (loading) {
    return (
      <div style={container}>
        <h2 style={loadingText}>Loading user…</h2>
      </div>
    );
  }

  return (
    <div style={container}>
      <h1 style={title}>Edit User ✏️</h1>

      <form style={card} onSubmit={handleSubmit}>
        {/* Name */}
        <label style={label}>Name</label>
        <input
          style={input}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />

        {/* Email */}
        <label style={label}>Email</label>
        <input
          style={input}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />

        {/* Role */}
        <label style={label}>Role</label>
        <select
          style={input}
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          required
        >
          <option value="admin">Admin</option>
          <option value="sales">Sales</option>
          <option value="client">Client</option>
          <option value="am">AM</option>
          <option value="hr">HR</option>
          <option value="finance">Finance</option>
          <option value="production">Production</option>
        </select>

        {/* Buttons */}
        <div style={buttonRow}>
          <button type="submit" style={saveButton} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>

          <a href={`/admin/view-users/${uid}`} style={cancelButton}>
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}

/* -----------------------
   Styles — SAME LOCKED THEME
------------------------ */

const container: React.CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "#f9fafb",
  fontFamily: "Inter, sans-serif",
  padding: "40px",
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  marginBottom: 20,
  color: "#111827",
};

const card: React.CSSProperties = {
  backgroundColor: "#fff",
  borderRadius: 12,
  padding: "30px",
  maxWidth: 600,
  boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
  display: "flex",
  flexDirection: "column",
  gap: 15,
};

const label: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "#4b5563",
};

const input: React.CSSProperties = {
  padding: "12px",
  fontSize: 15,
  borderRadius: 8,
  border: "1px solid #d1d5db",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 15,
  marginTop: 20,
};

const saveButton: React.CSSProperties = {
  padding: "12px 20px",
  backgroundColor: "#111827",
  color: "#fff",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
};

const cancelButton: React.CSSProperties = {
  padding: "12px 20px",
  backgroundColor: "#ef4444",
  color: "#fff",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 600,
};

const loadingText: React.CSSProperties = {
  fontSize: 20,
  color: "#6b7280",
};
