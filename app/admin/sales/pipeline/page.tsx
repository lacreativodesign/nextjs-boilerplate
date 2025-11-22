export default function SalesPipelinePage() {
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
        Pipeline
      </h3>
      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        Placeholder Kanban view. Stages will be:
        <br />
        New Lead → Contacted → Qualified → Proposal Sent → Negotiation → Closed Won → Closed Lost
      </p>
    </div>
  );
}
