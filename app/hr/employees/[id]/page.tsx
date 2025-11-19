"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ERPLayout from "@/components/layouts/ERPLayout";

type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  status?: string;
  createdAt?: string;
};

export default function EmployeeProfile() {
  const params = useParams();
  const id = params?.id as string;

  const [data, setData] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    async function fetchData() {
      try {
        const res = await fetch(`/api/hr/employees/get?id=${id}`, {
          method: "GET",
          credentials: "include",
        });

        const json = await res.json();

        setData(
          json.employee ||
            json.user ||
            json.data ||
            (json?.id ? json : null)
        );
      } catch (err) {
        console.error("Profile fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id]);

  return (
    <ERPLayout role="hr" title="Employee Profile">
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {loading ? (
          <p style={{ textAlign: "center", marginTop: 40 }}>Loading...</p>
        ) : !data ? (
          <p style={{ textAlign: "center", marginTop: 40 }}>
            Employee not found.
          </p>
        ) : (
          <>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
              {data.name}
            </h2>

            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 30 }}>
              Employee details and HR insights
            </p>

            {/* Card */}
            <div
              style={{
                background: "#fff",
                padding: 24,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
              }}
            >
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
                Personal Information
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  rowGap: 20,
                  columnGap: 40,
                }}
              >
                <Field label="Name" value={data.name} />
                <Field label="Email" value={data.email} />
                <Field label="Role" value={data.role} />
                <Field label="Department" value={data.department || "—"} />
                <Field label="Status" value={data.status || "—"} />
                <Field
                  label="Joined"
                  value={
                    data.createdAt
                      ? new Date(data.createdAt).toLocaleDateString()
                      : "—"
                  }
                />
              </div>
            </div>

            {/* Second Card */}
            <div
              style={{
                background: "#fff",
                padding: 24,
                marginTop: 30,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
              }}
            >
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
                HR Summary
              </h3>

              <p style={{ fontSize: 14, color: "#6b7280" }}>
                Attendance logs, project mapping, and performance insights will
                be added once backend is active.
              </p>
            </div>
          </>
        )}
      </div>
    </ERPLayout>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p
        style={{
          fontSize: 12,
          color: "#6b7280",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 15, fontWeight: 500 }}>{value}</p>
    </div>
  );
          }
