import './globals.css';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import ToastProvider from '@/components/providers/ToastProvider';
import { ConfirmProvider } from '@/components/providers/ConfirmProvider';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { PageErrorFallback } from '@/components/errors/ErrorFallback';
import PWAInitializer from '@/components/pwa/PWAInitializer';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import ClientMonitoring from '@/components/monitoring/ClientMonitoring';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Bizosto',
  description: 'The Operating System for Service Businesses.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon-32.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Bizosto',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#012167',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-request CSP nonce, set by middleware on the x-nonce request header.
  // Attaching it to the inline theme script makes that script compliant with
  // the nonce-based strict CSP (Report-Only today, enforced in S31-B).
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en-US" dir="ltr" className={inter.variable} suppressHydrationWarning>
      <body className={inter.className}>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('bizosto_theme')||'system';var d=window.matchMedia('(prefers-color-scheme:dark)').matches;var dark=t==='dark'||(t==='system'&&d);document.documentElement.classList.toggle('dark',dark);if(!dark&&t==='light')document.documentElement.classList.add('light');}catch(e){}})();`,
          }}
        />
        <ThemeProvider>
          <ErrorBoundary fallbackComponent={PageErrorFallback}>
            <ToastProvider />
            <PWAInitializer />
            <ClientMonitoring />
            <ConfirmProvider>{children}</ConfirmProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
