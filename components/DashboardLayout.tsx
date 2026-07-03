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
        backgroundColor: '#f3f4f6',
        fontFamily: 'Inter, sans-serif',
        color: '#111827',
      }}
    >
      <aside
        style={{
          width: 260,
          backgroundColor: '#111827',
          color: '#e5e7eb',
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
              color: '#f9fafb',
            }}
          >
            BIZOSTO ERP
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>{title}</div>
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
                color: '#e5e7eb',
                backgroundColor: '#1f2937',
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
