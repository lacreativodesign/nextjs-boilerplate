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
    <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">BIZOSTO ERP Help Center</p>
        <h1 className="mt-2 text-3xl font-semibold text-gray-900 md:text-4xl">How can we help?</h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-600 md:text-base">
          Search product documentation, best-practice guides, videos, and FAQs. No login is required.
        </p>
      </header>

      <HelpSearch />

      <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {helpCategories.map((category) => {
          const Icon = category.icon;
          return (
            <article key={category.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Icon className="h-5 w-5 text-blue-700" />
                <h2 className="text-lg font-semibold text-gray-900">{category.name}</h2>
              </div>
              <ul className="space-y-2">
                {category.articles.slice(0, 5).map((article) => (
                  <li key={article.slug}>
                    <Link
                      href={`/help/${category.id}/${article.slug}`}
                      className="text-sm text-gray-700 hover:text-blue-700 hover:underline"
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

      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Frequently asked questions</h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="font-medium text-gray-900">How quickly can I launch BIZOSTO ERP?</dt>
            <dd className="mt-1 text-gray-600">Most tenants complete setup in under one day using the quick start checklist.</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Can I export articles for compliance documentation?</dt>
            <dd className="mt-1 text-gray-600">Yes. Every article includes Print and Download PDF actions for offline archiving.</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Do you support guided onboarding calls?</dt>
            <dd className="mt-1 text-gray-600">Enterprise plans include onboarding sessions coordinated through the support ticket form.</dd>
          </div>
        </dl>
      </section>

      <section className="mt-10 grid gap-4 rounded-2xl border border-gray-200 bg-white p-6 md:grid-cols-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Contact Support</h2>
          <p className="mt-2 text-sm text-gray-600">Typical response time: 24–48 hours.</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">Live chat</p>
          <p className="mt-1 text-sm text-gray-600">Crisp chat widget is available when configured.</p>
        </div>
        <div className="space-y-3 text-sm text-gray-700">
          <form className="space-y-2 rounded-lg border border-gray-200 p-3" action="mailto:support@bizosto.com" method="post" encType="text/plain">
            <p className="font-medium text-gray-900">Support ticket form</p>
            <input name="subject" required placeholder="Subject" className="w-full rounded-md border border-gray-200 px-2 py-1.5" />
            <textarea name="details" required placeholder="Describe your issue" className="min-h-20 w-full rounded-md border border-gray-200 px-2 py-1.5" />
            <button type="submit" className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700">Submit ticket</button>
          </form>
          <p>
            Email support: <a className="text-blue-700 hover:underline" href="mailto:support@bizosto.com">support@bizosto.com</a>
          </p>
        </div>
      </section>
      <CrispChatWidget />
    </main>
  );
}
