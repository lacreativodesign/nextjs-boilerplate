import "./globals.css";
import { Suspense } from "react";
import ToastProvider from "@/components/providers/ToastProvider";
import RouteProgress from "@/components/ui/RouteProgress";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { PageErrorFallback } from "@/components/errors/ErrorFallback";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary
          fallbackComponent={PageErrorFallback}
          onError={(error, errorInfo) => {
            console.error("Root Layout Error:", error, errorInfo);
          }}
        >
          <ToastProvider />
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
