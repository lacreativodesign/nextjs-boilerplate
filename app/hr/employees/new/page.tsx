'use client';

import React, { useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { showToast } from '@/lib/utils/toast';

/**
 * S10: an employee IS a tenant user. Creating one provisions a Firebase Auth account,
 * stamps { role, tenantId } claims and emails a set-password invitation, so the role
 * field has to be a real ERP role rather than free text — the API rejects anything else,
 * and it previously accepted any string straight into an orphan collection.
 *
 * `admin`, `super_admin` and `client` are absent on purpose: HR must not be able to mint
 * an account more privileged than its own, and client portal identities are created
 * through the client invite flow.
 */
const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'sales', label: 'Sales' },
  { value: 'sales_manager', label: 'Sales Manager' },
  { value: 'am', label: 'Account Manager' },
  { value: 'am_manager', label: 'AM Manager' },
  { value: 'production', label: 'Production' },
  { value: 'production_manager', label: 'Production Manager' },
  { value: 'finance', label: 'Finance' },
  { value: 'hr', label: 'HR' },
];

export default function AddEmployeePage() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.currentTarget);

    const payload = {
      name: form.get('name'),
      email: form.get('email'),
      role: form.get('role'),
      department: form.get('department'),
      status: form.get('status'),
    };

    try {
      const res = await apiFetch('/api/hr/employees/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (json.success) {
        showToast.success(
          json.emailSent
            ? 'Employee created. Invitation emailed.'
            : 'Employee created, but the invitation email could not be sent.',
        );
        window.location.href = '/hr/employees';
      } else {
        showToast.error('Failed: ' + (json.message || 'Unknown error'));
      }
    } catch (err) {
      showToast.error('Error creating employee.');
    }

    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>Add New Employee</h2>

      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 30 }}>
        This creates their account and emails them an invitation to set a password. They will appear
        on the team roster straight away.
      </p>

      {/* Form Container */}
      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: 700,
          background: 'var(--surface-card)',
          padding: 30,
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        }}
      >
        {/* Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
            marginBottom: 25,
          }}
        >
          {/* Name */}
          <div>
            <label style={labelStyle}>Full Name</label>
            <input name="name" required style={inputStyle} />
          </div>

          {/* Email */}
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" name="email" required style={inputStyle} />
          </div>

          {/* Role */}
          <div>
            <label style={labelStyle}>Role</label>
            <select name="role" required defaultValue="" style={inputStyle}>
              <option value="" disabled>
                Select a role
              </option>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div>
            <label style={labelStyle}>Department</label>
            <input name="department" required style={inputStyle} />
          </div>

          {/* Status */}
          <div>
            <label style={labelStyle}>Status</label>
            <select name="status" style={inputStyle}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px 22px',
            borderRadius: 8,
            background: loading ? 'var(--text-soft)' : 'var(--erp-blue)',
            color: 'white',
            border: 'none',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Saving...' : 'Create Employee'}
        </button>
      </form>
    </div>
  );
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase' as const,
  marginBottom: 6,
  display: 'block',
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--input-border)',
  fontSize: 15,
  outline: 'none',
};
