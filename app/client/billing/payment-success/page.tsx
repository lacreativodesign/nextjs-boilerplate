export default function PaymentSuccessPage() {
  return (
    <div className="space-y-6">
      <div className="card p-6 max-w-2xl">
        <h1 className="page-title">Payment successful</h1>
        <p className="page-subtitle mt-2">Your invoice payment was submitted successfully and is being finalized.</p>
        <div className="mt-4 flex gap-3">
          <a className="btn" href="/client/billing" style={{ borderRadius: 999 }}>
            Back to billing
          </a>
        </div>
      </div>
    </div>
  );
}
