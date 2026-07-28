'use client';

import React from 'react';
import Link from 'next/link';
import { menuForRole, normalizeRole } from '@/lib/erpAccess';

type Props = {
  role: string;
  title: string;
  children: React.ReactNode;
};

export default function DashboardLayout({ role, title, children }: Props) {
  const normalizedRole = normalizeRole(role);
  const navLinks = menuForRole(normalizedRole);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        backgroundColor: 'var(--gray-100)',
        fontFamily: 'Inter, sans-serif',
        color: 'var(--text-strong)',
      }}
    >
      <aside
        style={{
          width: 260,
          backgroundColor: 'var(--text-strong)',
          color: 'var(--surface-neutral)',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 20px',
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--gray-50)',
            }}
          >
            BIZOSTO ERP
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>{title}</div>
        </div>

        <nav style={{ flex: 1 }}>
          {navLinks.map((link) => (
            <Link
              key={`${link.label}-${link.href}`}
              href={link.href}
              style={{
                display: 'block',
                padding: '10px 12px',
                marginBottom: 4,
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--surface-neutral)',
                backgroundColor: 'var(--surface-inverse)',
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: '24px 28px 40px' }}>{children}</main>
    </div>
  );
}
