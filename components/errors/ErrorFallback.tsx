"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserErrorMessage } from "@/lib/error/messages";
import type { ErrorCode } from "@/lib/errors";

interface ErrorFallbackProps {
  error: Error & { code?: ErrorCode; correlationId?: string };
  resetError?: () => void;
  context?: "page" | "module" | "component";
  moduleName?: string;
}

export function ErrorFallback({
  error,
  resetError,
  context = "component",
  moduleName,
}: ErrorFallbackProps) {
  const router = useRouter();
  const [retryCount, setRetryCount] = useState(0);

  const userMessage = useMemo(
    () => getUserErrorMessage({ code: error.code || "INTERNAL_SERVER_ERROR", message: error.message, locale: "en" }),
    [error.code, error.message],
  );

  const handleGoHome = () => {
    router.push("/dashboard");
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleRetry = () => {
    if (!resetError) return;
    setRetryCount((current) => current + 1);
    resetError();
  };

  const handleReportIssue = () => {
    const subject = encodeURIComponent(`Issue report: ${moduleName || "Application"} error`);
    const body = encodeURIComponent(
      [
        `Module: ${moduleName || "Global"}`,
        `Error code: ${error.code || "INTERNAL_SERVER_ERROR"}`,
        `Correlation ID: ${error.correlationId || "not-provided"}`,
        `Message: ${userMessage.message}`,
      ].join("\n"),
    );

    window.open(`mailto:support@bizosto.com?subject=${subject}&body=${body}`, "_blank", "noopener,noreferrer");
  };

  const getIcon = () => {
    switch (context) {
      case "page":
        return "🚫";
      case "module":
        return "⚠️";
      case "component":
        return "❌";
      default:
        return "⚠️";
    }
  };

  const getTitle = () => {
    if (moduleName) {
      return `${moduleName} issue`;
    }

    return userMessage.title;
  };

  return (
    <div className="flex min-h-[400px] items-center justify-center p-6">
      <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 dark:border-red-800 dark:bg-red-950">
        <div className="mb-4 text-center text-6xl">{getIcon()}</div>

        <h2 className="mb-2 text-center text-2xl font-bold text-red-900 dark:text-red-100">{getTitle()}</h2>

        <p className="mb-3 text-center text-red-700 dark:text-red-300">{userMessage.message}</p>
        <p className="mb-4 text-center text-sm text-red-700 dark:text-red-300">Suggested action: {userMessage.action}</p>

        <div className="mb-6 rounded bg-red-100 p-3 text-xs text-red-900 dark:bg-red-900 dark:text-red-100">
          <p>Error code: {error.code || "INTERNAL_SERVER_ERROR"}</p>
          <p>Retry attempts: {retryCount}</p>
          {error.correlationId && <p>Correlation ID: {error.correlationId}</p>}
        </div>

        {process.env.NODE_ENV === "development" && (
          <details className="mb-6 rounded bg-red-100 p-4 dark:bg-red-900">
            <summary className="cursor-pointer font-semibold text-red-900 dark:text-red-100">Technical Details</summary>
            <pre className="mt-2 overflow-auto text-xs text-red-800 dark:text-red-200">{error.stack}</pre>
          </details>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          {resetError && (
            <button onClick={handleRetry} className="rounded-lg bg-red-600 px-6 py-2 text-white hover:bg-red-700">
              Retry
            </button>
          )}

          <button
            onClick={handleReportIssue}
            className="rounded-lg border border-red-600 bg-white px-6 py-2 text-red-600 hover:bg-red-50 dark:bg-red-950 dark:hover:bg-red-900"
          >
            Report Issue
          </button>

          {context === "page" && (
            <>
              <button
                onClick={handleGoHome}
                className="rounded-lg border border-red-600 bg-white px-6 py-2 text-red-600 hover:bg-red-50 dark:bg-red-950 dark:hover:bg-red-900"
              >
                Go to Dashboard
              </button>

              <button
                onClick={handleReload}
                className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Reload Page
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PageErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorFallback error={error} resetError={reset} context="page" />;
}

export function ModuleErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorFallback error={error} resetError={reset} context="module" />;
}

export function ComponentErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorFallback error={error} resetError={reset} context="component" />;
}
