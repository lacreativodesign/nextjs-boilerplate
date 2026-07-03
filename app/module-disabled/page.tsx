'use client';

import Link from 'next/link';
import { useTenantContext } from '@/lib/tenant/useTenantContext';

export default function ModuleDisabledPage() {
  const { data } = useTenantContext();
  const role = data?.user?.role || '';
  const billingPath = role === 'client' ? '/client/billing' : '/billing';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 520,
          padding: 32,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Upgrade Required</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Module Not Enabled</div>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          This module is not enabled for your company. Reach out to your administrator to request
          access.
        </p>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
          <Link
            href={billingPath}
            className="rounded-full bg-[var(--erp-blue)] px-5 py-2 text-sm font-semibold text-white"
          >
            View upgrade options
          </Link>
        </div>
      </div>
    </div>
  );
}
