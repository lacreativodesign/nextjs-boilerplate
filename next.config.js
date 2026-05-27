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

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: false,
});

const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
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
    optimizePackageImports: [
      'lodash-es',
      'recharts',
      'lucide-react',
      '@heroicons/react',
    ],
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
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
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

module.exports = withSentryConfig(
  withBundleAnalyzer(withPWA(nextConfig)),
  sentryWebpackPluginOptions,
  {
    hideSourceMaps: true,
    disableLogger: true,
    tunnelRoute: '/monitoring',
  },
);
