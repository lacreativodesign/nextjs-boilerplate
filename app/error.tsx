"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/errors/ErrorFallback";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string; code?: "INTERNAL_SERVER_ERROR"; correlationId?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (error) {
      Sentry.captureException(error, {
        tags: { errorBoundary: "route" },
        extra: { digest: error.digest },
      });
    }
    console.error("Global Error:", error);
  }, [error]);

  return <ErrorFallback error={error} resetError={reset} context="page" moduleName="Application" />;
}
