"use client";

export default function SuspendedPage() {
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
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Account Suspended</div>
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          Your company account is currently suspended. Please contact your account owner or support to
          restore access.
        </p>
      </div>
    </div>
  );
}
