import "./globals.css";
import "./workspace.css";
import { DM_Sans, Sora } from "next/font/google";
import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import ToastProvider from "@/components/providers/ToastProvider";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { PageErrorFallback } from "@/components/errors/ErrorFallback";
import PWAInitializer from "@/components/pwa/PWAInitializer";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { DensityProvider } from "@/components/providers/DensityProvider";
import ClientMonitoring from "@/components/monitoring/ClientMonitoring";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sora",
});

export const metadata: Metadata = {
  title: "Bizosto",
  description: "The Operating System for Service Businesses.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon-32.png",
  },
  appleWebApp: {
    capable: true,
    title: "Bizosto",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#18191a" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en-US"
      dir="ltr"
      className={`${dmSans.variable} ${sora.variable}`}
      suppressHydrationWarning
    >
      <body className={dmSans.className}>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('bizosto_theme')||'system';var d=window.matchMedia('(prefers-color-scheme:dark)').matches;var dark=t==='dark'||(t==='system'&&d);document.documentElement.classList.toggle('dark',dark);document.documentElement.classList.toggle('light',!dark&&t==='light');var density=localStorage.getItem('bizosto_workspace_density')==='compact'?'compact':'comfortable';document.documentElement.dataset.density=density;}catch(e){}})();`,
          }}
        />
        <ThemeProvider>
          <DensityProvider>
            <ErrorBoundary fallbackComponent={PageErrorFallback}>
              <ToastProvider />
              <PWAInitializer />
              <ClientMonitoring />
              <ConfirmProvider>{children}</ConfirmProvider>
            </ErrorBoundary>
          </DensityProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
