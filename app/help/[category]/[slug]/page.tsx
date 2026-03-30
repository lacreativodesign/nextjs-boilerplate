import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleFeedback } from "@/components/help-center/ArticleFeedback";
import { PrintActions } from "@/components/help-center/PrintActions";
import { findRelatedArticles, getArticleBySlug, helpCategories } from "@/lib/help-center/data";

type ArticlePageProps = {
  params: {
    category: string;
    slug: string;
  };
};


export function generateStaticParams() {
  return helpCategories.flatMap((category) =>
    category.articles.map((article) => ({
      category: category.id,
      slug: article.slug,
    }))
  );
}

function slugifyHeading(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function HelpArticlePage({ params }: ArticlePageProps) {
  const found = getArticleBySlug(params.category, params.slug);
  if (!found) notFound();

  const { article, category } = found;
  const tableOfContents = article.sections.map((section) => ({
    id: slugifyHeading(section.heading),
    label: section.heading,
  }));
  const related = findRelatedArticles(article.relatedSlugs).filter((item) => item.slug !== article.slug).slice(0, 4);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 print:max-w-none print:px-0">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-[var(--text-muted)]">
        <Link href="/help" className="hover:text-blue-700">Help</Link>
        <span className="mx-2">/</span>
        <Link href="/help" className="hover:text-blue-700">{category.name}</Link>
        <span className="mx-2">/</span>
        <span>{article.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        <article className="min-w-0">
          <header className="card p-6">
            <h1 className="text-3xl font-semibold text-[var(--text-primary)]">{article.title}</h1>
            <p className="mt-3 text-sm text-[var(--text-muted)]">{article.excerpt}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[var(--text-muted)]">Last updated: {article.lastUpdated} · {article.readTime} read</p>
              <PrintActions />
            </div>
          </header>

          <div className="mt-6 space-y-8 card p-6">
            {article.sections.map((section) => (
              <section key={section.heading} id={slugifyHeading(section.heading)}>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">{section.heading}</h2>
                <div className="mt-3 space-y-4">
                  {section.blocks.map((block, index) => {
                    if (block.type === "paragraph") {
                      return <p key={`${section.heading}-p-${index}`} className="text-sm leading-6 text-[var(--text-primary)]">{block.content}</p>;
                    }

                    if (block.type === "list") {
                      return (
                        <ul key={`${section.heading}-ul-${index}`} className="list-disc space-y-2 pl-5 text-sm text-[var(--text-primary)]">
                          {block.items.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      );
                    }

                    if (block.type === "steps") {
                      return (
                        <ol key={`${section.heading}-ol-${index}`} className="list-decimal space-y-2 pl-5 text-sm text-[var(--text-primary)]">
                          {block.items.map((item) => <li key={item}>{item}</li>)}
                        </ol>
                      );
                    }

                    if (block.type === "code") {
                      return (
                        <pre key={`${section.heading}-code-${index}`} className="overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs text-gray-100">
                          <code>{block.content}</code>
                        </pre>
                      );
                    }

                    if (block.type === "video") {
                      return (
                        <div key={`${section.heading}-video-${index}`} className="space-y-2">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{block.title} ({block.duration})</p>
                          <div className="aspect-video overflow-hidden rounded-xl border border-[var(--border-subtle)]">
                            <iframe
                              src={block.embedUrl}
                              title={block.title}
                              loading="lazy"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="h-full w-full"
                            />
                          </div>
                        </div>
                      );
                    }

                    if (block.type === "image") {
                      return (
                        <figure key={`${section.heading}-image-${index}`}>
                          <Image
                            src={block.src}
                            alt={block.alt}
                            width={1120}
                            height={640}
                            className="w-full rounded-xl border border-[var(--border-subtle)]"
                          />
                          <figcaption className="mt-2 text-xs text-[var(--text-muted)]">{block.caption}</figcaption>
                        </figure>
                      );
                    }

                    return (
                      <div
                        key={`${section.heading}-callout-${index}`}
                        className={`rounded-lg border p-3 text-sm ${block.tone === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-blue-300 bg-blue-50 text-blue-900"}`}
                      >
                        {block.content}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <ArticleFeedback />

          <section className="mt-8 card p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Related articles</h2>
            <ul className="mt-3 space-y-2">
              {related.map((item) => (
                <li key={`${item.categoryId}-${item.slug}`}>
                  <Link href={`/help/${item.categoryId}/${item.slug}`} className="text-sm text-blue-700 hover:underline">
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </article>

        <aside className="h-fit card p-5 lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Table of contents</h2>
          <ul className="mt-3 space-y-2">
            {tableOfContents.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-sm text-[var(--text-muted)] hover:text-[var(--erp-blue)]">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
