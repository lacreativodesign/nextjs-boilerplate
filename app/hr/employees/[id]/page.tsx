'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function EmployeeProfilePage() {
  const { id } = useParams();
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/hr/employees/get?id=${id}`);
        const data = await res.json();
        if (data.success) setEmployee(data.employee);
      } catch (e) {
        console.error('Error loading employee:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

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
          background: 'var(--surface-card)',
          padding: 30,
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* HEADER */}
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>{employee.name}</h2>

        <p style={{ color: 'var(--text-muted)', marginBottom: 25 }}>{employee.email}</p>

        {/* GRID */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 20,
          }}
        >
          <ProfileCard label="Role" value={employee.role} />
          <ProfileCard label="Department" value={employee.department} />
          <ProfileCard label="Status" value={employee.status} />
          <ProfileCard label="Joined" value={new Date(employee.createdAt).toLocaleDateString()} />
        </div>

        {/* SPACER */}
        <div style={{ height: 30 }} />

        {/* PLACEHOLDER FOR NEXT STEPS */}
        <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
          Attendance Summary (Coming Next)
        </h3>
        <div
          style={{
            background: 'var(--surface-muted)',
            padding: 20,
            borderRadius: 10,
            border: '1px solid var(--border-subtle)',
          }}
        >
          <p style={{ color: 'var(--text-muted)' }}>
            Attendance charts and logs will show here once we complete Step 5.
          </p>
        </div>

        <div style={{ height: 30 }} />

        <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
          Activity Log (Coming Next)
        </h3>
        <div
          style={{
            background: 'var(--surface-muted)',
            padding: 20,
            borderRadius: 10,
            border: '1px solid var(--border-subtle)',
          }}
        >
          <p style={{ color: 'var(--text-muted)' }}>
            Recent activity will appear here after backend integration.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProfileCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 20,
        background: 'var(--surface-card)',
        borderRadius: 10,
        border: '1px solid var(--border-subtle)',
      }}
    >
      <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 600, marginTop: 5 }}>{value}</p>
    </div>
  );
}
