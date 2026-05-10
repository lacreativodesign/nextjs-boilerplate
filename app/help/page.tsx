import Link from "next/link";
import { HelpSearch } from "@/components/help-center/HelpSearch";
import { CrispChatWidget } from "@/components/help-center/CrispChatWidget";
import { helpCategories } from "@/lib/help-center/data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Help Center",
  description: "Documentation, video tutorials, FAQs, and support for BIZOSTO ERP.",
};

export default function HelpCenterPage() {
  return (
    <main className="page-frame py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--erp-blue)]">Bizosto ERP Help Center</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)] md:text-4xl">How can we help?</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)] md:text-base">
          Search product documentation, best-practice guides, videos, and FAQs. No login is required.
        </p>
      </header>

      <HelpSearch />

      <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {helpCategories.map((category) => {
          const Icon = category.icon;
          return (
            <article key={category.id} className="card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Icon className="h-5 w-5 text-[var(--erp-blue)]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{category.name}</h2>
              </div>
              <ul className="space-y-2">
                {category.articles.slice(0, 5).map((article) => (
                  <li key={article.slug}>
                    <Link
                      href={`/help/${category.id}/${article.slug}`}
                      className="text-sm text-[var(--text-muted)] hover:text-[var(--erp-blue)] hover:underline"
                    >
                      {article.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <section className="mt-8 card p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Frequently asked questions</h2>
        <dl className="mt-4 space-y-4 text-sm">
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
      </section>

      <section className="mt-10 card p-6 grid gap-4 md:grid-cols-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Contact Support</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Typical response time: 24–48 hours.</p>
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Live chat</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Crisp chat widget is available when configured.</p>
        </div>
        <div className="space-y-3 text-sm text-[var(--text-primary)]">
          <form className="space-y-2 rounded-lg border border-gray-200 p-3" action="mailto:support@bizosto.com" method="post" encType="text/plain">
            <p className="font-medium text-[var(--text-primary)]">Support ticket form</p>
            <input name="subject" required placeholder="Subject" className="w-full rounded-md border border-gray-200 px-2 py-1.5" />
            <textarea name="details" required placeholder="Describe your issue" className="min-h-20 w-full rounded-md border border-gray-200 px-2 py-1.5" />
            <button type="submit" className="btn">Submit ticket</button>
          </form>
          <p>
            Email support: <a className="text-[var(--erp-blue)] hover:underline" href="mailto:support@bizosto.com">support@bizosto.com</a>
          </p>
        </div>
      </section>
      <CrispChatWidget />
    </main>
  );
}
