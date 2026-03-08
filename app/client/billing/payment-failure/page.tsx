export default function PaymentFailurePage() {
  return (
    <div className="space-y-6">
      <div className="card p-6 max-w-2xl">
        <h1 className="page-title">Payment not completed</h1>
        <p className="page-subtitle mt-2">
          Stripe checkout was canceled or failed. No charge has been finalized. You can retry from the invoice details.
        </p>
        <div className="mt-4 flex gap-3">
          <a className="btn" href="/client/billing" style={{ borderRadius: 999 }}>
            Return to billing
          </a>
        </div>
      </div>
    </div>
  );
}
