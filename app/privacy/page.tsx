import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Bizosto",
  description: "How Bizosto collects, uses, and protects your data.",
};

const SECTIONS = [
  {
    title: "1. Information We Collect",
    content: `We collect information you provide directly when you create an account, including your name, email address, company name, and billing information. We also collect usage data, log files, and cookies to operate and improve the platform.`,
  },
  {
    title: "2. How We Use Your Information",
    content: `We use your information to provide, maintain, and improve the Bizosto platform; process transactions; send service-related communications; respond to support requests; and comply with legal obligations. We do not sell your personal data to third parties.`,
  },
  {
    title: "3. Data Storage and Security",
    content: `Your data is stored on Google Cloud infrastructure (Firebase/Firestore) with encryption at rest and in transit. We implement industry-standard security measures including role-based access control, audit logging, and multi-tenant data isolation. Each tenant's data is strictly isolated from all other tenants.`,
  },
  {
    title: "4. Data Retention",
    content: `We retain your data for as long as your account is active. Upon account termination, your data is retained for 30 days in a read-only state, after which it is permanently deleted from our systems. You may request immediate deletion by contacting support@bizosto.com.`,
  },
  {
    title: "5. Cookies and Tracking",
    content: `We use session cookies for authentication and localStorage for user preferences. We use Sentry for error tracking (anonymised user data only). We do not use advertising cookies or share data with ad networks.`,
  },
  {
    title: "6. Third-Party Services",
    content: `Bizosto integrates with third-party services including Stripe (payments), Resend (email), Google (authentication and Drive), and Sentry (error monitoring). Each service operates under its own privacy policy. We only share the minimum data required to provide the integration.`,
  },
  {
    title: "7. Your Rights",
    content: `You have the right to access, correct, export, or delete your personal data at any time. To exercise these rights, contact us at support@bizosto.com. We will respond within 30 days.`,
  },
  {
    title: "8. Changes to This Policy",
    content: `We may update this Privacy Policy from time to time. We will notify you of significant changes via email or an in-app notice. Continued use of the platform after changes constitutes acceptance of the updated policy.`,
  },
  {
    title: "9. Contact Us",
    content: `For privacy-related questions or requests, contact us at: support@bizosto.com | bizosto.com`,
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--app-bg)]">
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #012167, #6692f9)", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: 18, letterSpacing: "0.08em", color: "#ffffff", textDecoration: "none" }}>
          BIZOSTO
        </Link>
        <Link href="/login" style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, textDecoration: "none" }}>
          Sign in →
        </Link>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-8">
          <h1 className="page-title">Privacy Policy</h1>
          <p className="page-subtitle mt-2">
            Last updated: March 2026 &nbsp;·&nbsp; Effective: March 2026
          </p>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            This Privacy Policy describes how LA Creativo Group (&quot;we&quot;, &quot;us&quot;, or
            &quot;Bizosto&quot;) collects, uses, and protects your information when you use
            the Bizosto platform at{" "}
            <a href="https://bizosto.com" className="text-[var(--erp-blue)] hover:underline">
              bizosto.com
            </a>
            .
          </p>
        </div>

        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.title} className="card p-6">
              <h2 className="section-title mb-3">{section.title}</h2>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                {section.content}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="helper-text">
            Questions?{" "}
            <a href="mailto:support@bizosto.com" className="text-[var(--erp-blue)] hover:underline">
              support@bizosto.com
            </a>
          </p>
          <div className="mt-4 flex justify-center gap-4 text-sm">
            <Link href="/terms" className="text-[var(--erp-blue)] hover:underline">
              Terms of Service
            </Link>
            <Link href="/login" className="text-[var(--erp-blue)] hover:underline">
              Sign In
            </Link>
            <Link href="/signup" className="text-[var(--erp-blue)] hover:underline">
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
