"use client";

import { useRef, useState } from "react";

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStart = useRef<number | null>(null);

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (window.scrollY <= 0) {
      touchStart.current = event.touches[0]?.clientY ?? null;
    }
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStart.current === null || refreshing) return;
    const delta = (event.touches[0]?.clientY ?? 0) - touchStart.current;
    if (delta > 0 && window.scrollY <= 0) {
      setPullDistance(Math.min(delta, 80));
    }
  };

  const onTouchEnd = () => {
    if (pullDistance > 65 && !refreshing) {
      setRefreshing(true);
      window.location.reload();
      return;
    }
    touchStart.current = null;
    setPullDistance(0);
  };

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="pointer-events-none fixed inset-x-0 top-[var(--header-height)] z-30 flex justify-center md:hidden">
        {pullDistance > 0 ? (
          <div className="rounded-full bg-[var(--surface-card)] px-3 py-1 text-xs text-[var(--text-muted)] shadow-[var(--shadow-sm)]">
            {refreshing ? "Refreshing..." : "Pull to refresh"}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
