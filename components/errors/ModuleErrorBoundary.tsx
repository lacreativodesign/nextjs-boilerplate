"use client";

import React, { ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { ModuleErrorFallback } from "./ErrorFallback";

interface ModuleErrorBoundaryProps {
  children: ReactNode;
  moduleName: string;
}

export function ModuleErrorBoundary({ children, moduleName }: ModuleErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackComponent={ModuleErrorFallback}
      resetKeys={[moduleName]}
    >
      {children}
    </ErrorBoundary>
  );
}
