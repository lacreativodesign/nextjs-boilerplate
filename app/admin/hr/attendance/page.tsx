'use client';

import { TableSkeleton } from '@/components/ui/Skeleton';

export default function HRAttendancePage() {
  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 20,
      }}
    >
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Attendance</h3>
      <p style={{ fontSize: 14, color: 'var(--sidebar-text)', marginBottom: 16 }}>
        Attendance dashboard is initializing.
      </p>
      <TableSkeleton rows={6} columns={5} />
    </div>
  );
}
