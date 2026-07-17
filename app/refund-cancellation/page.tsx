import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy | Bizosto',
  description: 'Bizosto refund and cancellation policy.',
};

const SECTIONS = [
  {
    title: '1. Free Trial',
    content: `New accounts receive a 14-day free trial. A valid payment method is required at signup to begin the trial, but you will not be charged during the trial period. If you cancel at any time before the end of day 14, you will not be charged anything. If you do not cancel, your subscription automatically converts to paid and billing begins on day 15 using the payment method provided at signup.`,
  },
  {
    title: '2. Cancelling Your Subscription',
    content: `You may cancel at any time from your billing settings. Cancellation takes effect at the end of your current billing period, and you retain full access until that date. No further charges are made after cancellation takes effect. If you change your mind before the period ends, you can reactivate with one click and service continues uninterrupted.`,
  },
  {
    title: '3. Plan Upgrades and Downgrades',
    content: `Upgrades take effect immediately and are charged a prorated amount for the remainder of the current billing period at the new plan rate. Downgrades take effect at the end of the current billing period; you keep your current plan features until then, and the lower rate applies from the next period onward.`,
  },
  {
    title: '4. Refunds',
    content: `Subscription fees for billing periods that have already elapsed are non-refundable, except where required by law. Cancelling stops future charges but does not entitle you to a refund of fees already paid, and no partial or prorated refunds are issued for unused time within a billing period. Where a refund is issued, it is processed through Stripe to the original payment method and may take 5-10 business days to appear.`,
  },
  {
    title: '5. Failed Payments',
    content: `If a scheduled payment fails, Bizosto retries automatically and notifies you. A 7-day grace period applies with full access. On day 8, your account enters a read-only state. On day 21, if payment is still outstanding, your account is hard-locked. Data is retained for 60 days after hard lock, after which it may be permanently deleted. You can restore access at any point before deletion by updating your payment method.`,
  },
  {
    title: '6. How to Cancel or Request a Refund',
    content: `To cancel, use the billing settings within your Bizosto workspace. For refund requests or billing questions, contact support@bizosto.com with your account email and workspace name.`,
  },
  {
    title: '7. Contact',
    content: `Bizosto is operated by LA CREATIVO GROUP, LLC. For any questions about this policy, contact support@bizosto.com.`,
  },
];

export default function RefundCancellationPage() {
  return (
    <div className="min-h-screen bg-[var(--app-bg)]">
      <div
        style={{
          background: 'linear-gradient(135deg, #012167, #6692f9)',
          padding: '0 24px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link
          href="/"
          style={{
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: '0.08em',
            color: '#ffffff',
            textDecoration: 'none',
          }}
        >
          BIZOSTO
        </Link>
        <Link
          href="/login"
          style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, textDecoration: 'none' }}
        >
          Sign in →
        </Link>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-8">
          <h1 className="page-title">Refund & Cancellation Policy</h1>
          <p className="page-subtitle mt-2">
            Last updated: July 2026 &nbsp;·&nbsp; Effective: July 2026
          </p>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            This Refund &amp; Cancellation Policy applies to all subscriptions to the Bizosto ERP
            platform operated by LA Creativo Group. It forms part of, and should be read together
            with, our Terms of Service.
          </p>
        </div>
        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.title} className="card p-6">
              <h2 className="section-title mb-3">{section.title}</h2>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">{section.content}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <p className="helper-text">
            Questions?{' '}
            <a href="mailto:support@bizosto.com" className="text-[var(--erp-blue)] hover:underline">
              support@bizosto.com
            </a>
          </p>
          <div className="mt-4 flex justify-center gap-4 text-sm">
            <Link href="/terms" className="text-[var(--erp-blue)] hover:underline">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-[var(--erp-blue)] hover:underline">
              Privacy Policy
            </Link>
            <Link href="/login" className="text-[var(--erp-blue)] hover:underline">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
