'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { HelpSearch } from '@/components/help-center/HelpSearch';
import { CrispChatWidget } from '@/components/help-center/CrispChatWidget';
import { helpCategories, type HelpArticle, type HelpCategory } from '@/lib/help-center/data';
import { useTenantContext } from '@/lib/tenant/useTenantContext';

const HELP_ROLE_TOPIC_ACCESS: Record<
  string,
  { allowedTopics?: readonly string[]; allowAll?: boolean; excludedTopics?: readonly string[] }
> = {
  super_admin: { allowAll: true },
  admin: { allowAll: true, excludedTopics: ['super_admin'] },
  finance: { allowedTopics: ['finance', 'billing', 'invoices', 'settings'] },
  hr: { allowedTopics: ['hr', 'employees', 'attendance', 'leave', 'payroll'] },
  sales: { allowedTopics: ['crm', 'leads', 'deals', 'pipeline'] },
  sales_manager: { allowedTopics: ['crm', 'leads', 'deals', 'pipeline'] },
  production: { allowedTopics: ['projects', 'production', 'files'] },
  production_manager: { allowedTopics: ['projects', 'production', 'files'] },
  am: { allowedTopics: ['projects', 'clients', 'files', 'change requests'] },
  am_manager: { allowedTopics: ['projects', 'clients', 'files', 'change requests'] },
  client: { allowedTopics: ['client portal'] },
};

function normalizeTopic(topic: string) {
  return topic.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function topicVariants(topic: string) {
  const normalized = normalizeTopic(topic);
  const variants = new Set([normalized]);
  if (normalized.endsWith('s')) variants.add(normalized.slice(0, -1));
  return variants;
}

function getArticleTopics(category: HelpCategory, article: HelpArticle) {
  const topics = new Set<string>();
  const addTopic = (topic: string) => {
    for (const variant of topicVariants(topic)) {
      if (variant) topics.add(variant);
    }
  };

  addTopic(category.id);
  addTopic(category.name);
  addTopic(article.slug);
  addTopic(article.title);
  article.keywords.forEach(addTopic);

  category.name.split(/\W+/).forEach(addTopic);
  article.slug.split(/\W+/).forEach(addTopic);
  article.title.split(/\W+/).forEach(addTopic);

  return topics;
}

function isArticleAllowed(category: HelpCategory, article: HelpArticle, role: string | null) {
  if (!role) return true;

  const normalizedRole = normalizeTopic(role).replace(/\s+/g, '_');
  const access = HELP_ROLE_TOPIC_ACCESS[normalizedRole];
  if (!access) return true;

  const articleTopics = getArticleTopics(category, article);
  const excludedTopics =
    access.excludedTopics?.flatMap((topic) => Array.from(topicVariants(topic))) ?? [];
  if (excludedTopics.some((topic) => articleTopics.has(topic))) return false;

  if (access.allowAll) return true;

  const allowedTopics =
    access.allowedTopics?.flatMap((topic) => Array.from(topicVariants(topic))) ?? [];
  return allowedTopics.some((topic) => articleTopics.has(topic));
}

function getRoleGuideName(role: string | null) {
  if (!role) return 'General';

  return role
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function HelpCenterPageContent() {
  const { data, loading } = useTenantContext();
  const currentRole = data?.user.role ?? null;

  const filteredCategories = useMemo(
    () =>
      (loading ? [] : helpCategories)
        .map((category) => ({
          ...category,
          articles: category.articles.filter((article) =>
            isArticleAllowed(category, article, currentRole),
          ),
        }))
        .filter((category) => category.articles.length > 0),
    [currentRole, loading],
  );

  return (
    <main className="page-frame py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--erp-blue)]">
          Bizosto ERP Help Center
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)] md:text-4xl">
          Help Center — {getRoleGuideName(currentRole)} Guide
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)] md:text-base">
          Search product documentation, best-practice guides, videos, and FAQs. No login is
          required.
        </p>
      </header>

      <HelpSearch categories={filteredCategories} />

      <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCategories.map((category) => {
          const Icon = category.icon;
          return (
            <article key={category.id} className="card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Icon className="h-5 w-5 text-[var(--erp-blue)]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  {category.name}
                </h2>
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
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Frequently asked questions
        </h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="font-medium text-[var(--text-primary)]">
              How quickly can I launch Bizosto ERP?
            </dt>
            <dd className="mt-1 text-[var(--text-muted)]">
              Most tenants complete setup in under one day using the quick start checklist.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--text-primary)]">
              Can I export articles for compliance documentation?
            </dt>
            <dd className="mt-1 text-[var(--text-muted)]">
              Yes. Every article includes Print and Download PDF actions for offline archiving.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--text-primary)]">
              Do you support guided onboarding calls?
            </dt>
            <dd className="mt-1 text-[var(--text-muted)]">
              Enterprise plans include onboarding sessions coordinated through the support ticket
              form.
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-10 card p-6 grid gap-4 md:grid-cols-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Contact Support</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Typical response time: 24–48 hours.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Live chat</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Crisp chat widget is available when configured.
          </p>
        </div>
        <div className="space-y-3 text-sm text-[var(--text-primary)]">
          <form
            className="space-y-2 rounded-lg border border-gray-200 p-3"
            action="mailto:support@bizosto.com"
            method="post"
            encType="text/plain"
          >
            <p className="font-medium text-[var(--text-primary)]">Support ticket form</p>
            <input
              name="subject"
              required
              placeholder="Subject"
              className="w-full rounded-md border border-gray-200 px-2 py-1.5"
            />
            <textarea
              name="details"
              required
              placeholder="Describe your issue"
              className="min-h-20 w-full rounded-md border border-gray-200 px-2 py-1.5"
            />
            <button type="submit" className="btn">
              Submit ticket
            </button>
          </form>
          <p>
            Email support:{' '}
            <a className="text-[var(--erp-blue)] hover:underline" href="mailto:support@bizosto.com">
              support@bizosto.com
            </a>
          </p>
        </div>
      </section>
      <CrispChatWidget />
    </main>
  );
}
