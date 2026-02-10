"use client";

import React, { ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { ModuleErrorFallback } from "./ErrorFallback";

interface ModuleErrorBoundaryProps {
  children: ReactNode;
  moduleName: string;
  onError?: (error: Error) => void;
}

export function ModuleErrorBoundary({ children, moduleName, onError }: ModuleErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackComponent={ModuleErrorFallback}
      onError={(error, errorInfo) => {
        console.error(`${moduleName} Error:`, error, errorInfo);
        onError?.(error);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
