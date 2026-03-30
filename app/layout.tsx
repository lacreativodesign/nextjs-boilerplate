import "./globals.css";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import ToastProvider from "@/components/providers/ToastProvider";
import RouteProgress from "@/components/ui/RouteProgress";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { PageErrorFallback } from "@/components/errors/ErrorFallback";
import PWAInitializer from "@/components/pwa/PWAInitializer";
import ClientMonitoring from "@/components/monitoring/ClientMonitoring";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Bizosto ERP",
  description: "Bizosto ERP multi-tenant operations platform",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-32.png",  sizes: "32x32",   type: "image/png" },
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
    ],
    apple: { url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    title: "Bizosto",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#012167",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-US" dir="ltr" className={inter.variable}>
      <body className={inter.className}>
        <ErrorBoundary fallbackComponent={PageErrorFallback}>
          <ToastProvider />
          <PWAInitializer />
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          <ClientMonitoring />
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
