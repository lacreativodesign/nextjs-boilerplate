'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Keeps the active tab visible in any horizontally-scrolling `.tabs-bar`.
 *
 * Several role layouts render a `.tabs-bar` with many `.tab-pill` items (the super_admin bar
 * has 16). When the tabs overflow, the active pill can sit off-screen to the right after a
 * route change, so the bar appears stuck on the first tab even though a later tab is selected.
 * The active pill IS highlighted in the DOM — it is simply scrolled out of view.
 *
 * This mounts once (in AppShell) and, on every pathname change, scrolls each bar's
 * `.tab-pill.active` into view horizontally. It is a no-op when nothing overflows and never
 * touches vertical scroll, so it cannot cause layout jumps on normal pages.
 */
export default function ActiveTabScroller() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Defer to the next frame so the newly-rendered active pill exists and layout is settled.
    const raf = requestAnimationFrame(() => {
      const bars = document.querySelectorAll<HTMLElement>('.tabs-bar');
      bars.forEach((bar) => {
        const active = bar.querySelector<HTMLElement>('.tab-pill.active');
        if (!active) return;
        // Only act when the bar actually overflows.
        if (bar.scrollWidth <= bar.clientWidth) return;
        const barRect = bar.getBoundingClientRect();
        const pillRect = active.getBoundingClientRect();
        const fullyVisible = pillRect.left >= barRect.left && pillRect.right <= barRect.right;
        if (fullyVisible) return;
        // Center the active pill within the bar without scrolling the page vertically.
        const delta = pillRect.left - barRect.left - (bar.clientWidth - active.clientWidth) / 2;
        bar.scrollBy({ left: delta, behavior: 'smooth' });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}
