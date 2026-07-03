'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { HelpCategory, SearchResult } from '@/lib/help-center/data';
import { helpCategories, searchArticles } from '@/lib/help-center/data';

type HelpSearchProps = {
  initialQuery?: string;
  initialCategory?: string;
  mode?: 'compact' | 'full';
  categories?: HelpCategory[];
};

function highlightMatch(text: string, query: string) {
  const normalized = query.trim();
  if (!normalized) return text;

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'ig');
  const parts = text.split(regex);

  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark key={`${part}-${idx}`} className="rounded bg-amber-100 px-1 text-amber-900">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${idx}`}>{part}</span>
    ),
  );
}

function flattenCategories(categories: HelpCategory[]): SearchResult[] {
  return categories.flatMap((category) =>
    category.articles.map((article) => ({
      categoryId: category.id,
      categoryName: category.name,
      slug: article.slug,
      title: article.title,
      excerpt: article.excerpt,
      lastUpdated: article.lastUpdated,
      searchableText: [
        article.title,
        article.excerpt,
        article.keywords.join(' '),
        article.sections.map((section) => section.heading).join(' '),
        article.sections
          .flatMap((section) =>
            section.blocks.flatMap((block) => {
              if (block.type === 'paragraph' || block.type === 'callout') return [block.content];
              if (block.type === 'list' || block.type === 'steps') return block.items;
              if (block.type === 'code') return [block.content];
              if (block.type === 'video') return [block.title];
              if (block.type === 'image') return [block.caption, block.alt];
              return [];
            }),
          )
          .join(' '),
      ]
        .join(' ')
        .toLowerCase(),
    })),
  );
}

function searchCategoryArticles(
  categories: HelpCategory[],
  query: string,
  categoryFilter?: string,
) {
  if (categories === helpCategories) return searchArticles(query, categoryFilter);

  const articles = flattenCategories(categories);
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    const base = categoryFilter
      ? articles.filter((item) => item.categoryId === categoryFilter)
      : articles;
    return base.slice(0, 12);
  }

  const terms = normalized.split(/\s+/).filter(Boolean);

  return articles
    .filter((article) => (categoryFilter ? article.categoryId === categoryFilter : true))
    .map((article) => {
      const score = terms.reduce((total, term) => {
        if (article.title.toLowerCase().includes(term)) return total + 5;
        if (article.excerpt.toLowerCase().includes(term)) return total + 3;
        if (article.searchableText.includes(term)) return total + 1;
        return total;
      }, 0);
      return { article, score };
    })
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || Date.parse(b.article.lastUpdated) - Date.parse(a.article.lastUpdated),
    )
    .map((row) => row.article)
    .slice(0, 20);
}

export function HelpSearch({
  initialQuery = '',
  initialCategory = '',
  mode = 'compact',
  categories = helpCategories,
}: HelpSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);

  const results = useMemo(
    () => searchCategoryArticles(categories, query, category || undefined),
    [categories, category, query],
  );
  const suggestions = useMemo(
    () => searchCategoryArticles(categories, query, category || undefined).slice(0, 5),
    [categories, category, query],
  );

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <input
            type="search"
            value={query}
            placeholder="Search guides, FAQs, tutorials, and troubleshooting"
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none ring-blue-500 transition focus:border-blue-500 focus:ring"
            aria-label="Search help articles"
          />
          {query && suggestions.length > 0 && (
            <div className="absolute z-10 mt-2 w-full rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                Suggestions
              </p>
              <ul className="space-y-1">
                {suggestions.map((item) => (
                  <li key={`${item.categoryId}-${item.slug}`}>
                    <Link
                      href={`/help/${item.categoryId}/${item.slug}`}
                      className="block rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <Link
          href={`/help/search?q=${encodeURIComponent(query)}${category ? `&category=${encodeURIComponent(category)}` : ''}`}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </Link>
      </div>

      {mode === 'full' && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-gray-500">{results.length} results</p>
          <ul className="space-y-3">
            {results.map((result) => (
              <SearchResultCard
                key={`${result.categoryId}-${result.slug}`}
                query={query}
                result={result}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SearchResultCard({ result, query }: { result: SearchResult; query: string }) {
  return (
    <li className="rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
        {result.categoryName}
      </p>
      <Link
        href={`/help/${result.categoryId}/${result.slug}`}
        className="mt-1 block text-lg font-semibold text-gray-900 hover:text-blue-700"
      >
        {highlightMatch(result.title, query)}
      </Link>
      <p className="mt-1 text-sm text-gray-600">{highlightMatch(result.excerpt, query)}</p>
      <p className="mt-2 text-xs text-gray-500">Updated {result.lastUpdated}</p>
    </li>
  );
}
