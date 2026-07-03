'use client';

import { Menu, X } from 'lucide-react';
import { useSidebar } from '@/lib/context/SidebarContext';

export function MobileNav() {
  const { isMobileOpen, openMobile, closeMobile } = useSidebar();

  return (
    <button
      type="button"
      onClick={isMobileOpen ? closeMobile : openMobile}
      className="touch-target fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm md:hidden"
      aria-label={isMobileOpen ? 'Close navigation' : 'Open navigation'}
      aria-expanded={isMobileOpen}
      aria-controls="primary-sidebar"
    >
      {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
    </button>
  );
}
