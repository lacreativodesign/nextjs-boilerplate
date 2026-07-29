'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api/client';

export default function HierarchyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { label: 'Organization Map', path: '/hierarchy' },
    { label: 'Teams', path: '/hierarchy/teams' },
    { label: 'Roles', path: '/hierarchy/roles' },
    { label: 'Reporting', path: '/hierarchy/reporting' },
    { label: 'Structure', path: '/hierarchy/structure' },
    { label: 'Settings', path: '/hierarchy/settings' },
  ];

  return (
    <RequireAuth allowed={['admin', 'super_admin']}>
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          backgroundColor: 'var(--gray-50)',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* SIDEBAR */}
        <aside
          style={{
            width: 250,
            backgroundColor: 'var(--text-strong)',
            color: 'white',
            padding: '30px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            boxShadow: '2px 0 10px rgba(0,0,0,0.15)',
          }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 30 }}>HIERARCHY</h2>

          {navItems.map((item) => {
            const active = pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                href={item.path}
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: active ? 'var(--surface-inverse)' : 'transparent',
                  color: active ? 'var(--text-on-brand)' : 'var(--gray-300)',
                  fontWeight: active ? 700 : 500,
                  textDecoration: 'none',
                  transition: '0.2s ease',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </aside>

        {/* MAIN AREA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* HEADER */}
          <header
            style={{
              backgroundColor: 'var(--text-on-brand)',
              borderBottom: '1px solid var(--surface-neutral)',
              padding: '20px 30px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-strong)' }}>
              Organization Hierarchy
            </h1>

            <button
              onClick={async () => {
                await apiFetch('/api/logout', {
                  method: 'POST',
                });
                window.location.href = '/login';
              }}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                background: 'var(--danger)',
                color: 'var(--text-on-brand)',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              LOGOUT
            </button>
          </header>

          {/* CONTENT */}
          <main style={{ padding: '30px' }}>{children}</main>
        </div>
      </div>
    </RequireAuth>
  );
}
