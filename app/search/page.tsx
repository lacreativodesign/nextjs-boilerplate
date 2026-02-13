'use client';

import RequireAuth from '@/components/RequireAuth';
import AppShell from '@/components/layout/AppShell';
import AdvancedSearchBuilder from '@/components/search/AdvancedSearchBuilder';

const ALLOWED_ROLES = [
  'super_admin',
  'admin',
  'sales',
  'sales_manager',
  'am',
  'am_manager',
  'production',
  'production_manager',
  'client',
  'hr',
  'finance',
];

export default function SearchResultsPage() {
  return (
    <RequireAuth allowed={ALLOWED_ROLES}>
      <AppShell>
        <div className="space-y-4">
          <div className="card p-4">
            <h1 className="text-xl font-semibold">Advanced Search</h1>
            <p className="text-sm text-[var(--text-soft)]">
              Build multi-filter queries, save searches, inspect history, and export result sets.
            </p>
          </div>
          <AdvancedSearchBuilder />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
