export default function DeliveryPipelinePage() {
  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 20,
      }}
    >
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
        Delivery Pipeline
      </h3>

      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Placeholder for pipeline view:
        Inquiry → Deposit → Kickoff → Draft → Review → Revisions → Final → Delivered.
      </p>
    </div>
  );
}
