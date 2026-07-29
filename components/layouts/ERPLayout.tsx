'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';

export default function ERPLayout({
  children,
  title = 'Dashboard',
  role = 'admin',
}: {
  children: React.ReactNode;
  title?: string;
  role: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItemsByRole: Record<string, Array<{ label: string; href: string }>> = {
    admin: [
      { label: 'Overview', href: '/admin' },
      { label: 'Create User', href: '/admin/users/create' },
      { label: 'View Users', href: '/admin/users' },
      { label: 'User Management', href: '/admin/user-management' },
    ],
    sales: [{ label: 'Sales Dashboard', href: '/sales' }],
    account_manager: [{ label: 'Account Manager', href: '/am' }],
    production: [{ label: 'Production Dashboard', href: '/production' }],
    hr: [{ label: 'HR Dashboard', href: '/hr' }],
    finance: [{ label: 'Finance Dashboard', href: '/finance' }],
    client: [
      { label: 'Client Dashboard', href: '/client' },
      { label: 'Profile Settings', href: '/client/settings' },
    ],
  };

  const menuItems = menuItemsByRole[role] || [];

  async function handleLogout() {
    try {
      await apiFetch('/api/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--gray-50)',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarOpen ? 240 : 70,
          transition: 'width 0.2s ease',
          background: 'var(--text-strong)',
          color: 'var(--text-on-brand)',
          paddingTop: 20,
          boxShadow: '2px 0 5px rgba(0,0,0,0.1)',
        }}
      >
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            marginLeft: 20,
            marginBottom: 20,
            padding: 10,
            background: 'var(--surface-inverse)',
            color: 'var(--text-on-brand)',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            width: sidebarOpen ? '80%' : '50px',
          }}
        >
          {sidebarOpen ? '⬅ Collapse' : '➡'}
        </button>

        {menuItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              style={{
                padding: '12px 20px',
                cursor: 'pointer',
                color: 'var(--gray-300)',
                fontWeight: 500,
              }}
            >
              {item.label}
            </div>
          </Link>
        ))}
      </aside>

      {/* Main content */}
      <main style={{ flex: 1 }}>
        <header
          style={{
            background: 'var(--surface-card)',
            padding: '20px 30px',
            borderBottom: '1px solid var(--surface-neutral)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>{title}</h1>

          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              background: 'var(--danger)',
              color: 'var(--text-on-brand)',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Logout
          </button>
        </header>

        <section style={{ padding: 30 }}>{children}</section>
      </main>
    </div>
  );
}
