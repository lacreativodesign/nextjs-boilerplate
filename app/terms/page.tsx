import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Bizosto",
  description: "Terms and conditions for using the Bizosto platform.",
};

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    content: `By accessing or using the Bizosto platform ("Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. These terms apply to all users, including administrators, team members, and clients.`,
  },
  {
    title: "2. Account Registration",
    content: `You must provide accurate and complete information when creating an account. You are responsible for maintaining the security of your login credentials and for all activities that occur under your account. Notify us immediately at support@bizosto.com of any unauthorised access.`,
  },
  {
    title: "3. Subscription and Billing",
    content: `Bizosto is offered on a subscription basis. After your 14-day free trial, continued access requires a paid subscription. Subscriptions are billed monthly via Stripe. You authorise us to charge your payment method on a recurring basis. You may cancel at any time; cancellation takes effect at the end of the current billing period. No refunds are issued for partial periods.`,
  },
  {
    title: "4. Acceptable Use",
    content: `You agree not to use the Service to: (a) violate any law or regulation; (b) infringe intellectual property rights; (c) transmit malware or harmful code; (d) attempt to gain unauthorised access to other accounts or systems; (e) use the Service to compete with Bizosto or resell access without authorisation.`,
  },
  {
    title: "5. Data Ownership",
    content: `You retain full ownership of all data you upload or create within Bizosto. We do not claim any intellectual property rights over your content. By using the Service, you grant us a limited licence to store, process, and display your data solely to provide the Service.`,
  },
  {
    title: "6. Service Availability",
    content: `We strive for 99.9% uptime but do not guarantee uninterrupted access. Scheduled maintenance will be communicated in advance. We are not liable for losses resulting from downtime, data loss, or service interruptions beyond our reasonable control.`,
  },
  {
    title: "7. Limitation of Liability",
    content: `To the maximum extent permitted by law, Bizosto shall not be liable for indirect, incidental, special, or consequential damages arising from use of the Service. Our total liability to you shall not exceed the amount you paid us in the 12 months prior to the claim.`,
  },
  {
    title: "8. Termination",
    content: `We may suspend or terminate your account immediately if you breach these Terms. You may terminate your account at any time by contacting support@bizosto.com. Upon termination, your data will be retained for 30 days in read-only state before permanent deletion.`,
  },
  {
    title: "9. Changes to Terms",
    content: `We may update these Terms from time to time. We will notify you of material changes via email or in-app notice at least 14 days before they take effect. Continued use of the Service after changes constitutes acceptance.`,
  },
  {
    title: "10. Governing Law",
    content: `These Terms are governed by and construed in accordance with applicable law. Any disputes shall be resolved through good-faith negotiation. If unresolved, disputes shall be subject to binding arbitration.`,
  },
  {
    title: "11. Contact",
    content: `For questions about these Terms, contact us at: support@bizosto.com | bizosto.com`,
  },
];

export default function TermsPage() {
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
          <h1 className="page-title">Terms of Service</h1>
          <p className="page-subtitle mt-2">
            Last updated: March 2026 &nbsp;·&nbsp; Effective: March 2026
          </p>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Please read these Terms of Service carefully before using the Bizosto
            ERP platform operated by LA Creativo Group.
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
            <Link href="/privacy" className="text-[var(--erp-blue)] hover:underline">
              Privacy Policy
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
