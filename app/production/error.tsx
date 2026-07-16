'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/errors/ErrorFallback';

/**
 * S32: a segment-level error boundary for the Production dashboard.
 *
 * Without this, a failed data fetch or a render error anywhere in this section bubbled to the
 * root boundary, which replaces the WHOLE page — the user loses the sidebar and their place,
 * and it reads like the app crashed. This boundary keeps the shell intact and shows a friendly
 * retry scoped to just this section, matching the existing module boundaries (finance, crm,
 * projects) so the experience is consistent across the app.
 */
export default function ProductionError({
  error,
  reset,
}: {
  error: Error & { digest?: string; code?: 'INTERNAL_SERVER_ERROR'; correlationId?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Production section error:', error);
  }, [error]);

  return <ErrorFallback error={error} resetError={reset} context="module" moduleName="Production" />;
}
