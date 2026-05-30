"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { showToast } from "@/lib/utils/toast";

export default function EditEmployeePage() {
  const { id } = useParams();
  const router = useRouter();

  const [employee, setEmployee] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/hr/employees/get?id=${id}`);
        const data = await res.json();
        if (data.success) setEmployee(data.employee);
      } catch (e) {
        console.error("Error loading employee:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/hr/employees/update?id=${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employee),
      });
      const data = await res.json();

      if (data.success) {
        router.push(`/hr/employees/${id}`);
      } else {
        showToast.error("Failed to update employee.");
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <p>Loading...</p>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        <p>Employee not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        style={{
          background: "#fff",
          padding: 30,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          maxWidth: 800,
        }}
      >
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 25 }}>
          Edit Employee
        </h2>

        {/* FORM GRID */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          <FormInput
            label="Full Name"
            value={String((employee as Record<string, unknown>).name ?? "")}
            onChange={(v) => setEmployee({ ...employee, name: v })}
          />

          <FormInput
            label="Email"
            value={String((employee as Record<string, unknown>).email ?? "")}
            onChange={(v) => setEmployee({ ...employee, email: v })}
          />

          <FormInput
            label="Role"
            value={String((employee as Record<string, unknown>).role ?? "")}
            onChange={(v) => setEmployee({ ...employee, role: v })}
          />

          <FormInput
            label="Department"
            value={String((employee as Record<string, unknown>).department ?? "")}
            onChange={(v) => setEmployee({ ...employee, department: v })}
          />

          <FormInput
            label="Status"
            value={String((employee as Record<string, unknown>).status ?? "")}
            onChange={(v) => setEmployee({ ...employee, status: v })}
          />
        </div>

        {/* BUTTON */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: 30,
            background: "#2563eb",
            color: "white",
            padding: "12px 24px",
            borderRadius: 8,
            border: "none",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label style={{ fontSize: 14, color: "#374151" }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          marginTop: 6,
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #d1d5db",
          fontSize: 15,
        }}
      />
    </div>
  );
         }
