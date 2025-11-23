"use client";

import { useState } from "react";

type TabKey = "invoices" | "payments" | "aging" | "estimates" | "retainers";

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("invoices");

  const tabs = [
    { key: "invoices", label: "Invoices" },
    { key: "payments", label: "Payments" },
    { key: "aging", label: "AR Aging" },
    { key: "estimates", label: "Estimates & Proposals" },
    { key: "retainers", label: "Retainers" },
  ];

  return (
    <div>
      {/* SPACER FOR BLUE PILL TABS (Handled in layout.tsx) */}
      <div style={{ marginBottom: 20 }} />

      {/* CONTENT AREA */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
        }}
      >
        {activeTab === "invoices" && <InvoicesSection />}
        {activeTab === "payments" && <PaymentsSection />}
        {activeTab === "aging" && <AgingSection />}
        {activeTab === "estimates" && <EstimatesSection />}
        {activeTab === "retainers" && <RetainersSection />}
      </div>
    </div>
  );
}

/* =======================================================
                    TAB CONTENT SECTIONS
   ======================================================= */

function InvoicesSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Invoices
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Placeholder for invoices list (client, amount, due date, status).
      </p>
    </div>
  );
}

function PaymentsSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Payments
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Placeholder for logged payments table.
      </p>
    </div>
  );
}

function AgingSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Accounts Receivable (Aging)
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Placeholder for AR aging buckets: 0–30, 31–60, 61–90, 90+ days.
      </p>
    </div>
  );
}

function EstimatesSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Estimates & Proposals
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Placeholder for estimates & proposals list.
      </p>
    </div>
  );
}

function RetainersSection() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Retainers
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Placeholder for monthly retainers & subscription billing.
      </p>
    </div>
  );
}
