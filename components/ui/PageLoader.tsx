import React from "react";
import { LoadingSpinner } from "./LoadingSpinner";

interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message = "Loading..." }: PageLoaderProps) {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <LoadingSpinner size="lg" label={message} />
    </div>
  );
}

export function FullScreenLoader({ message }: PageLoaderProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-card)]">
      <LoadingSpinner size="xl" label={message} />
    </div>
  );
}

export default PageLoader;
