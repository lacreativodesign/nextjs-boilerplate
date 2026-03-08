"use client";

import { useRef, useState } from "react";

export default function SwipeableListItem({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const startX = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    startX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    const delta = (event.touches[0]?.clientX ?? 0) - startX.current;
    if (delta < 0) {
      setOffset(Math.max(delta, -96));
    }
  };

  const onTouchEnd = () => {
    if (offset <= -70) {
      onDelete();
    }
    startX.current = null;
    setOffset(0);
  };

  return (
    <div className="relative overflow-hidden" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-red-500 text-sm font-semibold text-white">Delete</div>
      <div style={{ transform: `translateX(${offset}px)` }} className="relative bg-[var(--surface-card)] transition-transform duration-150">
        {children}
      </div>
    </div>
  );
}
