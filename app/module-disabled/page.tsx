"use client";

export default function ModuleDisabledPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 520,
          padding: 32,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Upgrade Required</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Module Not Enabled</div>
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          This module is not enabled for your company. Reach out to your administrator to request
          access.
        </p>
      </div>
    </div>
  );
}
