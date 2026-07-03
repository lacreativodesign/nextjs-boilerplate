'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/errors/ErrorFallback';

export default function CrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string; code?: 'INTERNAL_SERVER_ERROR'; correlationId?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('CRM module error:', error);
  }, [error]);

  return <ErrorFallback error={error} resetError={reset} context="module" moduleName="CRM" />;
}
