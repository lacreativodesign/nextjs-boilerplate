import "./globals.css";
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import ToastProvider from "@/components/providers/ToastProvider";
import RouteProgress from "@/components/ui/RouteProgress";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { PageErrorFallback } from "@/components/errors/ErrorFallback";
import PWAInitializer from "@/components/pwa/PWAInitializer";

export const metadata: Metadata = {
  title: "Bizosto ERP",
  description: "Bizosto ERP multi-tenant operations platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Bizosto",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-US" dir="ltr" suppressHydrationWarning>
      <body>
        <ErrorBoundary fallbackComponent={PageErrorFallback}>
          <ToastProvider />
          <PWAInitializer />
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
