import Link from "next/link";
import { HelpSearch } from "@/components/help-center/HelpSearch";
import { CrispChatWidget } from "@/components/help-center/CrispChatWidget";
import { helpCategories } from "@/lib/help-center/data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Help Center",
  description: "Documentation, video tutorials, FAQs, and support for Bizosto ERP.",
};

export default function HelpCenterPage() {
  return (
    <div className="space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-blue)] mb-1">
            Bizosto ERP Help Center
          </p>
          <h1 className="page-title">How can we help?</h1>
          <p className="page-subtitle">
            Search product documentation, best-practice guides, videos, and FAQs.
          </p>
        </div>

        <HelpSearch />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {helpCategories.map((category) => {
            const Icon = category.icon;
            return (
              <div key={category.id} className="card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Icon className="h-5 w-5 text-[var(--erp-blue)]" />
                  <h2 className="section-title">{category.name}</h2>
                </div>
                <ul className="space-y-2">
                  {category.articles.slice(0, 5).map((article) => (
                    <li key={article.slug}>
                      <Link
                        href={`/help/${category.id}/${article.slug}`}
                        className="text-sm text-[var(--text-muted)] hover:text-[var(--erp-blue)] transition-colors"
                      >
                        {article.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="card p-6">
          <h2 className="section-title mb-4">Frequently Asked Questions</h2>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-[var(--text-primary)]">How quickly can I launch Bizosto ERP?</dt>
              <dd className="mt-1 text-[var(--text-muted)]">Most tenants complete setup in under one day using the quick start checklist.</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--text-primary)]">Can I export articles for compliance documentation?</dt>
              <dd className="mt-1 text-[var(--text-muted)]">Yes. Every article includes Print and Download PDF actions for offline archiving.</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--text-primary)]">Do you support guided onboarding calls?</dt>
              <dd className="mt-1 text-[var(--text-muted)]">Enterprise plans include onboarding sessions coordinated through the support ticket form.</dd>
            </div>
          </dl>
        </div>

        <div className="card p-6 grid gap-6 md:grid-cols-3">
          <div>
            <h2 className="section-title mb-2">Contact Support</h2>
            <p className="helper-text">Typical response time: 24–48 hours.</p>
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Live chat</p>
            <p className="helper-text mt-1">Available when configured via Crisp.</p>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Email support</p>
            
              href="mailto:support@bizosto.com"
              className="text-sm text-[var(--erp-blue)] hover:underline"
            >
              support@bizosto.com
            </a>
          </div>
        </div>

        <CrispChatWidget />
    </div>
  );
}
