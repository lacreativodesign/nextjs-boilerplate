export type AutomatedCheckKey =
  | 'environmentVariables'
  | 'databaseIndexes'
  | 'apiRoutes'
  | 'lighthousePerformance'
  | 'sslCertificate'
  | 'errorTracking';

export type ManualCategory = {
  category: string;
  items: string[];
};

export const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'FIREBASE_ADMIN_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_APP_URL',
  'ONBOARDING_FROM_EMAIL',
] as const;

export const AUTOMATED_CHECKS: Array<{ key: AutomatedCheckKey; name: string }> = [
  { key: 'environmentVariables', name: 'Environment Variables' },
  { key: 'databaseIndexes', name: 'Database Indexes' },
  { key: 'apiRoutes', name: 'API Routes' },
  { key: 'lighthousePerformance', name: 'Lighthouse Performance' },
  { key: 'sslCertificate', name: 'SSL Certificate' },
  { key: 'errorTracking', name: 'Error Tracking' },
];

export const MANUAL_CHECKS: ManualCategory[] = [
  {
    category: 'Content',
    items: [
      'Pricing page copy reviewed',
      'Help center has 20+ articles',
      'Terms of Service updated',
      'Privacy Policy updated',
      'Contact information correct',
    ],
  },
  {
    category: 'Security',
    items: [
      'Rate limiting enabled',
      'MFA tested',
      'SSO tested (Google & Microsoft)',
      'Data encryption verified',
      'Audit logs working',
    ],
  },
  {
    category: 'Integrations',
    items: [
      'Stripe test mode disabled',
      'Email sending (production domain)',
      'QuickBooks/Xero tested',
      'Slack notifications working',
      'SMS (Twilio) tested',
    ],
  },
  {
    category: 'Performance',
    items: [
      'CDN enabled (Cloudflare)',
      'Images optimized (WebP)',
      'Bundle size <300KB',
      'Redis caching working',
      'Load tested (100 concurrent users)',
    ],
  },
  {
    category: 'Testing',
    items: [
      'All critical user flows tested',
      'Mobile app tested (iOS & Android)',
      'Email templates tested',
      'Payment flow tested',
      'Trial signup tested',
    ],
  },
  {
    category: 'Monitoring',
    items: [
      'Sentry alerts configured',
      'Uptime monitoring (UptimeRobot)',
      'Error rate alerts set',
      'Performance alerts set',
      'Backup system tested',
    ],
  },
];

export const PRODUCTION_CONFIGURATION_ITEMS = [
  'Environment variables checklist',
  'Domain configuration (custom domain)',
  'DNS records verified',
  'Email domain verified (SPF, DKIM)',
  'Analytics setup (Google Analytics, Vercel Analytics)',
] as const;

export function normalizeManualCheckId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

export function getAllManualCheckIds() {
  return MANUAL_CHECKS.flatMap((category) => category.items.map(normalizeManualCheckId));
}

export function getAllProductionConfigurationIds() {
  return PRODUCTION_CONFIGURATION_ITEMS.map(normalizeManualCheckId);
}
