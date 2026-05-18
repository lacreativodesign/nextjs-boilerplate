'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import {
  helpCategories,
  type HelpArticle,
  type HelpCategory,
  type HelpIcon,
} from '@/lib/help-center/data';
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

type ArticleCard = {
  article: HelpArticle;
  categoryId: string;
  categoryName: string;
  Icon: HelpIcon;
};

const quickLinks = [
  {
    label: '📖 Full Documentation',
    href: 'https://docs.bizosto.com',
  },
  {
    label: '🎥 Video Tutorials',
    href: 'https://bizosto.com/tutorials',
  },
  {
    label: '💬 Community',
    href: 'https://bizosto.com/community',
  },
] as const;

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

function flattenArticleCards(categories: HelpCategory[]): ArticleCard[] {
  return categories.flatMap((category) =>
    category.articles.map((article) => ({
      article,
      categoryId: category.id,
      categoryName: category.name,
      Icon: category.icon,
    })),
  );
}

export function HelpCenterPageContent() {
  const { data, loading } = useTenantContext();
  const [searchQuery, setSearchQuery] = useState('');
  const currentRole = data?.user.role ?? null;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

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

  const articleCards = useMemo(() => flattenArticleCards(filteredCategories), [filteredCategories]);

  const visibleArticleCards = useMemo(() => {
    if (!normalizedSearchQuery) return articleCards;

    return articleCards.filter(({ article }) =>
      article.title.toLowerCase().includes(normalizedSearchQuery),
    );
  }, [articleCards, normalizedSearchQuery]);

  return (
    <main className="page-frame py-10">
      <header className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-sm)] md:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--erp-blue)]">
          Bizosto ERP Help Center
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] md:text-4xl">
          Help Center — {getRoleGuideName(currentRole)} Guide
        </h1>
        <p className="mt-3 text-sm text-[var(--text-muted)] md:text-base">
          Guides, tutorials, and docs for your role.
        </p>

        <div className="mt-6">
          <label htmlFor="help-guide-search" className="sr-only">
            Search guides
          </label>
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-soft)]" />
            <input
              id="help-guide-search"
              type="search"
              value={searchQuery}
              placeholder="Search guides..."
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] py-3 pl-12 pr-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--erp-blue)] focus:bg-[var(--surface-card)] focus:shadow-[var(--focus-ring)]"
              aria-label="Search guides"
            />
          </div>
        </div>
      </header>

      <section className="mt-8">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Guides</h2>
            <p className="text-sm text-[var(--text-muted)]">
              {visibleArticleCards.length} {visibleArticleCards.length === 1 ? 'guide' : 'guides'}
              {normalizedSearchQuery ? ' matching your search' : ' available for your role'}.
            </p>
          </div>
        </div>

        {visibleArticleCards.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {visibleArticleCards.map(({ article, categoryId, categoryName, Icon }) => (
              <article
                key={`${categoryId}-${article.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] transition duration-200 hover:-translate-y-1 hover:border-[var(--erp-blue)] hover:shadow-[var(--shadow-lift)]"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--erp-blue-soft)]">
                    <Icon className="h-5 w-5 text-[var(--erp-blue)]" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-soft)]">
                      {categoryName}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                      {article.title}
                    </h3>
                  </div>
                </div>
                <p className="mt-4 truncate text-sm text-[var(--text-muted)]">{article.excerpt}</p>
                <a
                  href="#"
                  className="mt-5 inline-flex text-sm font-semibold text-[var(--erp-blue)] transition hover:text-[var(--erp-blue-hover)]"
                  aria-label={`Read ${article.title}`}
                >
                  Read Guide →
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-8 text-center shadow-[var(--shadow-sm)]">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">No guides found</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Try a different title search to find guides available for your role.
            </p>
          </div>
        )}
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Quick links">
        {quickLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 text-sm font-semibold text-[var(--text-primary)] shadow-[var(--shadow-sm)] transition duration-200 hover:-translate-y-1 hover:border-[var(--erp-blue)] hover:text-[var(--erp-blue)] hover:shadow-[var(--shadow-lift)]"
          >
            {link.label}
          </a>
        ))}
      </section>
    </main>
  );
}
