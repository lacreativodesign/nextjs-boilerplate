export default function FinancePaymentsPage() {
  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 20,
      }}
    >
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Payments</h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Placeholder for logged payments (method, date, client).
      </p>
    </div>
  );
}
