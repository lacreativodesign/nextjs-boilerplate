'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

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
      <div>
        <h1 className="page-title">{employee.name}</h1>
        <p className="page-subtitle mt-2">{employee.email}</p>
      </div>

      <div
        style={{
          background: 'var(--surface-card)',
          padding: 30,
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
        }}
      >
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

        <div style={{ height: 30 }} />

        <div className="flex flex-wrap gap-3" aria-label="Employee records">
          <Link className="btn" href={`/hr/attendance/${encodeURIComponent(String(id))}`}>
            View attendance
          </Link>
          <Link className="btn ghost" href="/hr/activity">
            View HR activity
          </Link>
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
