"use client";

import React, { ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { ErrorFallback } from "./ErrorFallback";

interface ModuleErrorBoundaryProps {
  children: ReactNode;
  moduleName: string;
  onError?: (error: Error) => void;
}

export function ModuleErrorBoundary({ children, moduleName, onError }: ModuleErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={<ErrorFallback error={new Error(`Failed to load ${moduleName} module`)} context="module" />}
      onError={(error, errorInfo) => {
        console.error(`${moduleName} Error:`, error, errorInfo);
        onError?.(error);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
