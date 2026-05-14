"use client";

import { useEffect, useState } from "react";
import { SkeletonForm } from "@/components/ui/Skeleton";
import { useParams, useRouter } from "next/navigation";

export default function EditUserPage() {
  const params = useParams();
  const router = useRouter();
  const uid = params?.uid as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "",
    disabled: false,
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/users/get?uid=${uid}`);
        if (!res.ok) {
          setError("Failed to load user");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setForm({
          name: data.user.name || "",
          email: data.user.email || "",
          role: data.user.role || "sales",
          disabled: !!data.user.disabled,
        });
      } catch (e) {
        setError("Error loading user");
      } finally {
        setLoading(false);
      }
    }

    if (uid) load();
  }, [uid]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/update", {
        method: "POST",
        body: JSON.stringify({
          uid,
          name: form.name,
          email: form.email,
          role: form.role,
          disabled: form.disabled,
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        setError(msg || "Failed to update user");
        setSaving(false);
        return;
      }

      router.push("/users");
    } catch (e) {
      setError("Error updating user");
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/users/delete", {
        method: "POST",
        body: JSON.stringify({ uid }),
      });

      if (!res.ok) {
        const msg = await res.text();
        setError(msg || "Failed to delete user");
        setDeleting(false);
        return;
      }

      router.push("/users");
    } catch (e) {
      setError("Error deleting user");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 500 }}>
        <SkeletonForm fields={4} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 16 }}>
        Edit User
      </h2>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 10,
            borderRadius: 8,
            background: "#fee2e2",
            color: "#b91c1c",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      <label>Name</label>
      <input
        style={{
          width: "100%",
          padding: 10,
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 14,
        }}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />

      <label>Email</label>
      <input
        style={{
          width: "100%",
          padding: 10,
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 14,
        }}
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />

      <label>Role</label>
      <select
        style={{
          width: "100%",
          padding: 10,
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 14,
        }}
        value={form.role}
        onChange={(e) => setForm({ ...form, role: e.target.value })}
      >
        <option value="admin">Admin</option>
        <option value="sales_manager">Sales Manager</option>
        <option value="production_manager">Production Manager</option>
        <option value="am_manager">AM Manager</option>
        <option value="am">Account Manager</option>
        <option value="sales">Sales</option>
        <option value="hr">HR</option>
        <option value="production">Production</option>
        <option value="finance">Finance</option>
        <option value="client">Client</option>
      </select>

      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={form.disabled}
          onChange={(e) => setForm({ ...form, disabled: e.target.checked })}
        />
        Disable login for this user
      </label>

      <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            background: "#2563eb",
            padding: "10px 18px",
            color: "white",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>

        <button
          onClick={() => history.back()}
          style={{
            background: "#e5e7eb",
            padding: "10px 18px",
            color: "#111827",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Cancel
        </button>

        <button
          onClick={onDelete}
          disabled={deleting}
          style={{
            marginLeft: "auto",
            background: "#ef4444",
            padding: "10px 18px",
            color: "white",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {deleting ? "Deleting..." : "Delete User"}
        </button>
      </div>
    </div>
  );
          }
