export default function FinanceARPage() {
  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 20,
      }}
    >
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>AR Aging</h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Placeholder for AR buckets (0-30, 31-60, 61-90, 90+ days).
      </p>
    </div>
  );
}
