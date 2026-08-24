'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { getBreadcrumbs } from '@/lib/navigation/sidebarConfig';

type BreadcrumbsProps = {
  pathname: string;
  className?: string;
};

export default function Breadcrumbs({ pathname, className = '' }: BreadcrumbsProps) {
  const trail = useMemo(() => getBreadcrumbs(pathname), [pathname]);
  const mobileTrail = trail.length > 2 ? trail.slice(-2) : trail;

  // A single crumb restates the page you are already on. Breadcrumbs earn their
  // vertical space only once there is somewhere to go back to.
  if (trail.length < 2) {
    return null;
  }

  const renderTrail = (items: { label: string; href: string }[]) => (
    <ol className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <li key={`${item.href}-${index}`} className="flex items-center gap-2">
            {!isLast ? (
              <Link href={item.href} className="hover:text-[var(--text-primary)]">
                {item.label}
              </Link>
            ) : (
              <span className="font-semibold text-[var(--text-primary)]">{item.label}</span>
            )}
            {!isLast && <span className="text-[var(--text-soft)]">/</span>}
          </li>
        );
      })}
    </ol>
  );

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <div className="hidden sm:block">{renderTrail(trail)}</div>
      <div className="sm:hidden">{renderTrail(mobileTrail)}</div>
    </nav>
  );
}
