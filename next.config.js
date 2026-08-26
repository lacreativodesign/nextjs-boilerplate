let withBundleAnalyzer = (config) => config;

if (process.env.ANALYZE === 'true') {
  try {
    withBundleAnalyzer = require('@next/bundle-analyzer')({
      enabled: true,
    });
  } catch {
    process.stderr.write(
      "[bundle-analyzer] Package '@next/bundle-analyzer' is not available in this environment. Continuing without analyzer.\n",
    );
  }
}

const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  // BUILD-01: deployment builds fail closed on both lint and TypeScript errors. CI keeps
  // explicit lint/typecheck steps as faster diagnostics, while these settings protect
  // Vercel builds even if repository branch protection or a workflow is misconfigured.
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  images: {
    domains: ['ucarecdn.com', 'firebasestorage.googleapis.com', 'imagedelivery.net'],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [32, 48, 64, 80, 96, 128, 160, 240, 320, 480, 640, 800],
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ucarecdn.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'imagedelivery.net',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['lodash-es', 'recharts', 'lucide-react', '@heroicons/react'],
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/(.*)\\.(js|css|svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2)$',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, s-maxage=2592000, immutable' },
        ],
      },
      {
        source: '/api/public/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/(.*)',
        // P3-4: these mirror the STATIC (non-CSP) security headers in
        // lib/security/headers.ts (getSecurityHeaders), which is the source of truth. The
        // middleware sets those on matched app/API paths via .set() (replace), so matched
        // responses keep identical values (no duplicate/conflicting headers). This block is
        // what covers responses the middleware matcher does NOT run on — static assets under
        // /_next/*, and public pages/files not in the matcher — so it must carry the same
        // strong set (notably HSTS, COOP, CORP) rather than a weaker legacy one. The nonce-based
        // CSP is intentionally NOT here; it is per-request and lives only in the middleware.
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com"), usb=(), fullscreen=(self)',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ];
  },
};

const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  telemetry: false,
  disableLogger: true,
};

module.exports = withSentryConfig(withBundleAnalyzer(nextConfig), sentryWebpackPluginOptions, {
  hideSourceMaps: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
});
