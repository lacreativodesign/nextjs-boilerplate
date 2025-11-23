export default function IntegrationSettings() {
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
        Integrations
      </h3>

      <p style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
        API keys, third-party tools, CRMs, automations (coming soon).
      </p>
    </div>
  );
}
