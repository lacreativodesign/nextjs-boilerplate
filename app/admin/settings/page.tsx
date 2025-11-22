"use client";

import { useState } from "react";

type TabKey = "general" | "email" | "integrations" | "security";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: "General" },
    { key: "email", label: "Email" },
    { key: "integrations", label: "Integrations" },
    { key: "security", label: "Security" },
  ];

  return (
    <div>
      {/* PAGE TITLE */}
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        System Settings
      </h2>

      {/* HORIZONTAL TABS */}
      <div
        style={{
          display: "flex",
          gap: 24,
          borderBottom: "1px solid var(--border)",
          marginBottom: 20,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: "transparent",
                border: "none",
                padding: "10px 0",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: isActive ? 700 : 500,
                borderBottom: isActive
                  ? "3px solid #2563eb"
                  : "3px solid transparent",
                color: isActive ? "#111827" : "var(--sidebar-text)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
        }}
      >
        {activeTab === "general" && <GeneralTab />}
        {activeTab === "email" && <EmailTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
        {activeTab === "security" && <SecurityTab />}
      </div>
    </div>
  );
}

/* ============ TAB SECTIONS ============ */

function GeneralTab() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        General Settings
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Update company profile, logo, timezone and system preferences.
      </p>
    </div>
  );
}

function EmailTab() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Email Settings
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Configure SMTP, email templates and notification preferences.
      </p>
    </div>
  );
}

function IntegrationsTab() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Integrations
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Manage Tawk.to, Resend API, WhatsApp, payment gateways and more.
      </p>
    </div>
  );
}

function SecurityTab() {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Security Settings
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Password rules, session expiration, device management, 2FA (future).
      </p>
    </div>
  );
        }
