"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface UserRecord {
  uid: string;
  name: string;
  email: string;
  role: string;
}

export default function UserDetailsPage() {
  const { uid } = useParams();
  const router = useRouter();

  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function loadUser() {
    try {
      const res = await fetch(`/api/admin/get-user?uid=${uid}`, {
        method: "GET",
        credentials: "include",
      });

      const data = await res.json();

      if (res.ok && data.user) setUser(data.user);
    } catch (err) {
      console.error("Failed to load user:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  async function deleteUser() {
    setDeleting(true);

    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ uid }),
    });

    setDeleting(false);

    if (res.ok) {
      alert("User deleted successfully");
      router.push("/admin/view-users");
    } else {
      alert("Failed to delete user");
    }
  }

  if (loading) {
    return (
      <div style={container}>
        <h2 style={loadingText}>Loading user…</h2>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={container}>
        <h2 style={loadingText}>User not found</h2>
      </div>
    );
  }

  return (
    <div style={container}>
      <h1 style={title}>User Details 👤</h1>

      <div style={card}>
        <p><strong>Name:</strong> {user.name}</p>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Role:</strong> {user.role}</p>

        <div style={buttonRow}>
          <a href={`/admin/view-users/${uid}/edit`} style={editButton}>
            Edit User
          </a>

          <button
            style={deleteButton}
            onClick={() => setConfirmDelete(true)}
          >
            Delete User
          </button>
        </div>
      </div>

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div style={modalOverlay}>
          <div style={modal}>
            <h3 style={modalTitle}>Are you sure?</h3>
            <p style={modalText}>
              This action cannot be undone. The user account and all associated data will be deleted.
            </p>

            <div style={modalButtons}>
              <button
                style={confirmDeleteButton}
                disabled={deleting}
                onClick={deleteUser}
              >
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>

              <button
                style={cancelModalButton}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== Styles (Same Locked Theme) ========== */

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
  padding: "30px",
  borderRadius: 12,
  maxWidth: 600,
  boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  marginTop: 20,
  gap: 15,
};

const editButton: React.CSSProperties = {
  padding: "12px 20px",
  backgroundColor: "#111827",
  color: "white",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 600,
};

const deleteButton: React.CSSProperties = {
  padding: "12px 20px",
  backgroundColor: "#dc2626",
  color: "white",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
};

const loadingText: React.CSSProperties = {
  fontSize: 20,
  color: "#6b7280",
};

/* Modal Styles */
const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const modal: React.CSSProperties = {
  background: "#fff",
  padding: "30px",
  width: 400,
  borderRadius: 12,
  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
};

const modalTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  marginBottom: 10,
};

const modalText: React.CSSProperties = {
  fontSize: 15,
  color: "#4b5563",
  marginBottom: 20,
};

const modalButtons: React.CSSProperties = {
  display: "flex",
  gap: 12,
};

const confirmDeleteButton: React.CSSProperties = {
  padding: "10px 20px",
  backgroundColor: "#dc2626",
  color: "white",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
};

const cancelModalButton: React.CSSProperties = {
  padding: "10px 20px",
  backgroundColor: "#6b7280",
  color: "white",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
};
