import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Security | Bizosto',
  description: 'How Bizosto protects your business data.',
};

const SECTIONS = [
  {
    title: 'Tenant Isolation',
    content: `Bizosto is a multi-tenant platform where every workspace's data is isolated at the application layer. Every record is scoped to your workspace, and every data access is validated server-side against the authenticated user's workspace, so your data is never visible to another tenant.`,
  },
  {
    title: 'Role-Based Access Control',
    content: `Access within a workspace is governed by eleven fixed roles spanning administration, sales, account management, production, finance, HR, and client access. Each role sees only the modules and data appropriate to it, and permissions are enforced on the server for every request, not just hidden in the interface.`,
  },
  {
    title: 'Authentication and Sessions',
    content: `Authentication is handled by Firebase Authentication. Sessions use secure, HTTP-only cookies and support server-side revocation, so when a user is deactivated or credentials change, existing sessions can be invalidated immediately rather than lingering until expiry.`,
  },
  {
    title: 'Financial Data Integrity',
    content: `Financial activity is recorded in an append-only ledger. Paid invoices are immutable, and corrections are made through explicit, audited actions such as void entries and credit notes, so your financial history cannot be silently rewritten.`,
  },
  {
    title: 'API Security',
    content: `Every API route is covered by an enforced route contract defining its authentication and access requirements, verified by automated tests in our continuous integration pipeline. Server-side rate limiting protects against abuse.`,
  },
  {
    title: 'Encryption',
    content: `All data in transit between your browser and Bizosto is encrypted using TLS (HTTPS). Data at rest is stored on Google Cloud infrastructure, which encrypts stored data by default.`,
  },
  {
    title: 'Infrastructure',
    content: `Bizosto runs on Vercel and Google Cloud (Firebase), enterprise-grade providers with extensive physical and network security programs. We do not operate our own physical servers. Payment card data is processed by Stripe and is never stored on Bizosto systems.`,
  },
  {
    title: 'Our Approach to Compliance',
    content: `We believe in truthful security claims. Bizosto does not currently hold third-party certifications such as SOC 2, and we will not claim certifications we have not earned. Our security program is built on the concrete controls described on this page, and we are working toward formal certification as the platform grows.`,
  },
  {
    title: 'Reporting a Vulnerability',
    content: `If you believe you have found a security vulnerability, please report it to support@bizosto.com with enough detail to reproduce the issue. We investigate all good-faith reports and ask that you give us reasonable time to address confirmed issues before public disclosure.`,
  },
];

export default function SecurityPage() {
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
          <h1 className="page-title">Security</h1>
          <p className="page-subtitle mt-2">Last updated: July 2026 &nbsp;·&nbsp; Effective: July 2026</p>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Security is built into the core of Bizosto. This page describes the concrete controls that protect your business data.
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
