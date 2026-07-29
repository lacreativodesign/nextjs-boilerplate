import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Cookie Policy | Bizosto',
  description: 'How Bizosto uses cookies and similar technologies.',
};

const SECTIONS = [
  {
    title: '1. What Are Cookies',
    content: `Cookies are small text files placed on your device by a website. They are widely used to make websites work, keep you signed in, and understand how a site is used. Similar technologies include browser local storage, which stores data on your device without transmitting it as a cookie.`,
  },
  {
    title: '2. Essential Cookies',
    content: `Bizosto uses strictly necessary cookies for authentication, session management, and security, including keeping you signed in and protecting against cross-site request forgery. These are required for the platform to function and cannot be switched off while using it.`,
  },
  {
    title: '3. Local Storage',
    content: `We use your browser's local storage to remember preferences such as your display theme and whether to keep you signed in. This data stays on your device and is not transmitted to us for tracking purposes.`,
  },
  {
    title: '4. Error Monitoring',
    content: `We use Sentry for error tracking to detect and fix platform issues. Sentry may process anonymised diagnostic data. We do not use advertising cookies and do not share data with ad networks.`,
  },
  {
    title: '5. Managing Cookies',
    content: `Most browsers let you refuse or delete cookies through their settings. If you block or delete essential cookies, parts of the platform including signing in may not function correctly.`,
  },
  {
    title: '6. Changes to This Policy',
    content: `We may update this Cookie Policy periodically, for example if the technologies we use change. The date above reflects the most recent revision.`,
  },
  {
    title: '7. Contact',
    content: `Bizosto is operated by LA CREATIVO GROUP, LLC. For questions about this policy, contact support@bizosto.com.`,
  },
];

export default function CookiePolicyPage() {
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
          <h1 className="page-title">Cookie Policy</h1>
          <p className="page-subtitle mt-2">
            Last updated: July 2026 &nbsp;·&nbsp; Effective: July 2026
          </p>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            This Cookie Policy explains how the Bizosto ERP platform, operated by LA Creativo Group,
            uses cookies and similar technologies. It should be read together with our Privacy
            Policy.
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
