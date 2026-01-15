"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useMemo, useState } from "react";
import { formatPkr, formatUsd } from "@/components/finance/financeUtils";

type Expense = {
  id: string;
  category: string;
  vendor: string | null;
  amountPkr: number;
  amountUsd: number;
  expenseDate: string | null;
  status: string;
  notes: string | null;
};

const emptyForm = {
  category: "",
  vendor: "",
  amountPkr: "",
  expenseDate: "",
  status: "Recorded",
  notes: "",
};

export default function AdminExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadExpenses = async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/admin/finance/expenses/list", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Unable to load expenses.");
      }
      setExpenses(data.expenses || []);
    } catch (err: any) {
      console.error("expenses load error", err);
      setError(err?.message || "Unable to load expenses right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  const totalPkr = useMemo(() => expenses.reduce((sum, row) => sum + Number(row.amountPkr || 0), 0), [expenses]);
  const totalUsd = useMemo(() => expenses.reduce((sum, row) => sum + Number(row.amountUsd || 0), 0), [expenses]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const payload = {
        category: form.category,
        vendor: form.vendor,
        amountPkr: Number(form.amountPkr || 0),
        expenseDate: form.expenseDate || null,
        status: form.status,
        notes: form.notes,
      };
      const res = await fetch("/api/admin/finance/expenses/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Unable to record expense.");
      }
      setForm(emptyForm);
      await loadExpenses();
    } catch (err: any) {
      console.error("expense create error", err);
      setError(err?.message || "Unable to record expense right now.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">Track operating expenses in PKR with USD normalization.</p>
        </div>
        <button className="btn" onClick={loadExpenses} style={{ borderRadius: 999 }}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="card" style={{ padding: 16, borderRadius: 14, border: "1px solid rgba(239,68,68,0.35)" }}>
          <div className="text-sm font-semibold text-red-500">{error}</div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="text-xs text-[var(--text-muted)]">Total spend (PKR)</div>
          <div className="text-2xl font-semibold mt-2">{loading ? "—" : formatPkr(totalPkr)}</div>
        </div>
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="text-xs text-[var(--text-muted)]">Total spend (USD)</div>
          <div className="text-2xl font-semibold mt-2">{loading ? "—" : formatUsd(totalUsd)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Record an expense</div>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <input
            className="input"
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            required
          />
          <input
            className="input"
            placeholder="Vendor (optional)"
            value={form.vendor}
            onChange={(e) => setForm((prev) => ({ ...prev, vendor: e.target.value }))}
          />
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount (PKR)"
            value={form.amountPkr}
            onChange={(e) => setForm((prev) => ({ ...prev, amountPkr: e.target.value }))}
            required
          />
          <input
            className="input"
            type="date"
            value={form.expenseDate}
            onChange={(e) => setForm((prev) => ({ ...prev, expenseDate: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Status"
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          />
          <div className="md:col-span-2 flex justify-end">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Record expense"}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 20, borderRadius: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Expense ledger</div>
        <div className="table-shell">
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Vendor</th>
                  <th className="text-right">Amount (PKR)</th>
                  <th className="text-right">Amount (USD)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="text-sm text-[var(--text-muted)]">
                      Loading expenses...
                    </td>
                  </tr>
                )}
                {!loading && expenses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-sm text-[var(--text-muted)]">
                      No expenses recorded yet.
                    </td>
                  </tr>
                )}
                {!loading &&
                  expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>{expense.expenseDate ? new Date(expense.expenseDate).toLocaleDateString() : "—"}</td>
                      <td>{expense.category}</td>
                      <td>{expense.vendor || "—"}</td>
                      <td className="text-right">{formatPkr(expense.amountPkr)}</td>
                      <td className="text-right">{formatUsd(expense.amountUsd)}</td>
                      <td>{expense.status}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
