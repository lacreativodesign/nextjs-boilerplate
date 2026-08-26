'use client';

export default function SuspendedPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 520,
          padding: 32,
          textAlign: 'center',
        }}
      >
        <h1 className="screen-title mb-3">Account Suspended</h1>
        <p className="screen-subtitle">
          Your company account is currently suspended. Please contact your account owner or support
          to restore access.
        </p>
      </div>
    </div>
  );
}
