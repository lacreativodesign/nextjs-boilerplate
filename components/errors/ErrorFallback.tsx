"use client";

import React from "react";
import { useRouter } from "next/navigation";

interface ErrorFallbackProps {
  error: Error;
  resetError?: () => void;
  context?: "page" | "module" | "component";
}

export function ErrorFallback({ error, resetError, context = "component" }: ErrorFallbackProps) {
  const router = useRouter();

  const handleGoHome = () => {
    router.push("/dashboard");
  };

  const handleReload = () => {
    window.location.reload();
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
    switch (context) {
      case "page":
        return "Page Error";
      case "module":
        return "Module Error";
      case "component":
        return "Component Error";
      default:
        return "Error";
    }
  };

  return (
    <div className="flex min-h-[400px] items-center justify-center p-6">
      <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 dark:border-red-800 dark:bg-red-950">
        <div className="mb-4 text-center text-6xl">{getIcon()}</div>

        <h2 className="mb-2 text-center text-2xl font-bold text-red-900 dark:text-red-100">{getTitle()}</h2>

        <p className="mb-4 text-center text-red-700 dark:text-red-300">
          {error.message || "An unexpected error occurred"}
        </p>

        {process.env.NODE_ENV === "development" && (
          <details className="mb-6 rounded bg-red-100 p-4 dark:bg-red-900">
            <summary className="cursor-pointer font-semibold text-red-900 dark:text-red-100">
              Error Details (Dev Only)
            </summary>
            <pre className="mt-2 overflow-auto text-xs text-red-800 dark:text-red-200">{error.stack}</pre>
          </details>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {resetError && (
            <button
              onClick={resetError}
              className="rounded-lg bg-red-600 px-6 py-2 text-white hover:bg-red-700"
            >
              Try Again
            </button>
          )}

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
