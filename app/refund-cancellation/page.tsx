import type { Metadata } from 'next';
import Link from 'next/link';
import { LIFECYCLE_COPY } from '@/lib/billing/lifecycle-policy';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy | Bizosto',
  description: 'Bizosto refund and cancellation policy.',
};

const SECTIONS = [
  {
    title: '1. Free Trial',
    content: LIFECYCLE_COPY.trial,
  },
  {
    title: '2. Cancelling Your Subscription',
    content: `You may cancel at any time from your billing settings. Cancellation takes effect at the end of your current billing period, and you retain full access until that date. No further charges are made after cancellation takes effect. If you change your mind before the period ends, you can reactivate with one click and service continues uninterrupted.`,
  },
  {
    title: '3. Plan Upgrades and Downgrades',
    content: LIFECYCLE_COPY.planChanges,
  },
  {
    title: '4. Refunds',
    content: `${LIFECYCLE_COPY.refunds} Bizosto does not offer a money-back guarantee.`,
  },
  {
    title: '5. Failed Payments',
    content: LIFECYCLE_COPY.failedPayment,
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
          background: 'linear-gradient(135deg, var(--brand-navy), var(--brand-blue-light))',
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
            color: 'var(--text-on-brand)',
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
