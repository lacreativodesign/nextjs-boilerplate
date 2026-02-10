import "./globals.css";
import { Suspense } from "react";
import ToastProvider from "@/components/providers/ToastProvider";
import RouteProgress from "@/components/ui/RouteProgress";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { ErrorFallback } from "@/components/errors/ErrorFallback";
import { ErrorTester } from "@/components/debug/ErrorTester";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary
          fallback={(error, resetError) => (
            <ErrorFallback
              error={error ?? new Error("Root layout failed to render")}
              context="page"
              resetError={resetError}
            />
          )}
          onError={(error, errorInfo) => {
            console.error("Root Layout Error:", error, errorInfo);
          }}
        >
          <ToastProvider />
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          {children}
          <ErrorTester />
        </ErrorBoundary>
      </body>
    </html>
  );
}
