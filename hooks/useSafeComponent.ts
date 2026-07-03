'use client';

import { useEffect, useState } from 'react';

export function useSafeComponent(componentName: string) {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      console.error(`${componentName} error:`, event.error);
      setError(event.error);
    };

    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, [componentName]);

  const clearError = () => setError(null);

  return { error, clearError };
}
