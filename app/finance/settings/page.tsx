"use client";

import { useIsSystemDark } from "@/components/finance/financeUtils";

const PAYMENT_METHODS = ["Card", "Bank", "Cash", "PayPal", "Wise", "Other"];

export default function FinanceSettingsPage() {
  const isDark = useIsSystemDark();

  return (
    <div className="space-y-4">
      <div>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}>Settings</h3>
        <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
          Finance role settings (read-only). Contact Admin for workflow-level changes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card" style={{ padding: 18, borderRadius: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Currency Display Rules</div>
          <p style={{ fontSize: 13, opacity: 0.75 }}>
            Client revenue is tracked in USD. Salaries, payroll, and operating expenses are tracked in PKR.
          </p>
        </div>

        <div className="card" style={{ padding: 18, borderRadius: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Invoice Numbering</div>
          <p style={{ fontSize: 13, opacity: 0.75 }}>
            Invoice IDs are generated in the format INV-0001 (read-only).
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card" style={{ padding: 18, borderRadius: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Payment Methods</div>
          <div className="space-y-2">
            {PAYMENT_METHODS.map((method) => (
              <div
                key={method}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)",
                }}
              >
                <span>{method}</span>
                <span style={{ fontSize: 12, opacity: 0.6 }}>Enabled</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderRadius: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>AR Aging Thresholds</div>
          <div className="space-y-3">
            <SettingRow label="0-30 days" value="0-30" />
            <SettingRow label="31-60 days" value="31-60" />
            <SettingRow label="61-90 days" value="61-90" />
            <SettingRow label="90+ days" value="90+" />
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
            Thresholds are defaults (editable in future release).
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <input className="input" value={value} readOnly style={{ maxWidth: 120 }} />
    </div>
  );
}
