export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-6 py-16">
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-8 text-center shadow-[var(--shadow-sm)]">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">You are offline</h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Bizosto could not connect to the network. Previously viewed data is still available and
          your offline actions will sync when connectivity returns.
        </p>
      </div>
    </main>
  );
}
