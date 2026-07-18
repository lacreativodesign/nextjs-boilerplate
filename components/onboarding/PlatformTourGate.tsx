'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { PlatformTour, TOUR_COMPLETED_STORAGE_KEY } from '@/components/onboarding/PlatformTour';
import { getRoleRoute } from '@/lib/roleRouting';

type PlatformTourGateProps = {
  role: string;
  companyName: string;
};

/**
 * ONB-01: single global mount for the first-login tour.
 *
 * The tour used to mount only inside the admin dashboard page, so nine of the eleven roles never
 * saw it. It now mounts once here (from AppShell, for every role) and fires only on each user's own
 * role home — the page every role reliably lands on right after login — so the tour opens once per
 * user in a predictable place instead of on whatever page happens to render first.
 *
 * Completion uses the same server-authoritative check the dashboard used: the local flag is a
 * no-flash fast path, and the per-user/per-version server state is the source of truth so a
 * completed tour never re-triggers on a new device or for a different account on a shared one.
 */
export function PlatformTourGate({ role, companyName }: PlatformTourGateProps) {
  const pathname = usePathname();
  const isRoleHome = pathname === getRoleRoute(role);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    if (!isRoleHome) return;
    let cancelled = false;
    const localDone = localStorage.getItem(TOUR_COMPLETED_STORAGE_KEY) === 'true';
    if (localDone) return;
    (async () => {
      try {
        const res = await fetch('/api/users/tour-state', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && !data?.completed) setShowTour(true);
        else if (data?.completed) localStorage.setItem(TOUR_COMPLETED_STORAGE_KEY, 'true');
      } catch {
        if (!cancelled) setShowTour(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isRoleHome]);

  if (!isRoleHome || !showTour) return null;

  return (
    <PlatformTour
      role={role.replace(/_/g, ' ')}
      companyName={companyName}
      onClose={() => setShowTour(false)}
    />
  );
}
