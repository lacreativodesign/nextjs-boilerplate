import { redirect } from 'next/navigation';

/**
 * F12 (FUNC-02) — this route was a "Placeholder for ..." stub. The real, implemented feature
 * lives at /hr/leave, so this stub redirects there instead of showing an unfinished page.
 */
export default function RedirectStubPage() {
  redirect('/hr/leave');
}
