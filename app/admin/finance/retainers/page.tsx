import { notFound } from 'next/navigation';

/**
 * F12 (FUNC-02) — this route was a "Placeholder for ..." stub for a feature that is not built
 * yet. Rather than show an unfinished page inside a sold plan, it returns 404 until the real
 * feature ships. It is not linked from any navigation.
 */
export default function UnbuiltFeaturePage() {
  notFound();
}
