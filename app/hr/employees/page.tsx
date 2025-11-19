"use client";

import React, { useEffect, useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function EmployeesListPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEmployees() {
      try {
        const res = await fetch("/api/hr/employees/list");
        const data = await res.json();

        if (data.success) {
          setEmployees(data.employees);
        }
      } catch (err) {
        console.error("Error fetching employees:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchEmployees();
  }, []);

  return (
    <ERPLayout role="hr" title="Employees">
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}>
        Employee Directory
      </h2>

      {loading ? (
        <p>Loading...</p>
      ) : employees.length === 0 ? (
        <p>No employees found.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "#fff",
              border: "1px solid #e5e7eb",
            }}
          >
            <thead>
              <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Department</th>
                <th style={th}>Status</th>
                <th style={th}>Created</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={td}>{emp.name}</td>
                  <td style={td}>{emp.email}</td>
                  <td style={td}>{emp.role}</td>
                  <td style={td}>{emp.department}</td>
                  <td style={td}>{emp.status}</td>
                  <td style={td}>
                    {new Date(emp.createdAt).toLocaleDateString()}
                  </td>
                  <td style={td}>
                    <button style={btn}>View</button>
                    <button style={btn}>Edit</button>
                    <button style={btnDelete}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ERPLayout>
  );
}

const th = {
  padding: "12px 15px",
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
  borderBottom: "1px solid #e5e7eb",
};

const td = {
  padding: "12px 15px",
  fontSize: 14,
  color: "#374151",
};

const btn = {
  padding: "6px 12px",
  marginRight: 8,
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#f9fafb",
  cursor: "pointer",
  fontSize: 13,
};

const btnDelete = {
  ...btn,
  background: "#fee2e2",
  borderColor: "#fecaca",
  color: "#b91c1c",
};
