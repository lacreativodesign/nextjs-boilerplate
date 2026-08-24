import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Resend } from 'resend';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';
import { requireSuperAdmin } from '../../_utils';

export const dynamic = 'force-dynamic';

type CheckStatus = 'pass' | 'fail' | 'warning';

type HealthCheck = {
  id: string;
  name: string;
  status: CheckStatus;
  message: string;
  value?: string | number;
};

const CHECK_TIMEOUT_MS = 5000;
const ROUTE_TIMEOUT_MS = 15000;

function summarize(checks: HealthCheck[]) {
  const passed = checks.filter((check) => check.status === 'pass').length;
  const failed = checks.filter((check) => check.status === 'fail').length;
  const warnings = checks.filter((check) => check.status === 'warning').length;

  return {
    total: checks.length,
    passed,
    failed,
    warnings,
  };
}

async function runWithTimeout(
  check: Omit<HealthCheck, 'status' | 'message'>,
  action: () => Promise<Omit<HealthCheck, 'id' | 'name'>>,
): Promise<HealthCheck> {
  const timeoutPromise = new Promise<HealthCheck>((resolve) => {
    setTimeout(() => {
      resolve({
        ...check,
        status: 'warning',
        message: 'Check timed out',
      });
    }, CHECK_TIMEOUT_MS);
  });

  const executionPromise = (async () => {
    try {
      const result = await action();
      return {
        ...check,
        ...result,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Check failed';
      return {
        ...check,
        status: 'fail' as const,
        message,
      };
    }
  })();

  return Promise.race([executionPromise, timeoutPromise]);
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const defaultTenantId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || 'bizosto';

    const checks = [
      runWithTimeout({ id: 'firebase-admin-sdk', name: 'Firebase Admin SDK' }, async () => {
        await adminDb.collection('tenants').limit(1).get();
        return { status: 'pass' as const, message: 'Firestore admin query succeeded' };
      }),
      runWithTimeout({ id: 'firebase-auth', name: 'Firebase Auth' }, async () => {
        await adminAuth.listUsers(1);
        return { status: 'pass' as const, message: 'Firebase Auth listUsers succeeded' };
      }),
      runWithTimeout(
        { id: 'required-collections', name: 'Required Firestore Collections' },
        async () => {
          const requiredCollections = [
            'tenants',
            'users',
            'clients',
            'invoices',
            'projects',
            'notifications',
          ];
          const snapshots = await Promise.all(
            requiredCollections.map((collection) => adminDb.collection(collection).limit(1).get()),
          );

          const missingCollections = requiredCollections.filter(
            (_, index) => snapshots[index].empty,
          );

          if (missingCollections.length > 0) {
            return {
              status: 'warning' as const,
              message: `Collections with no documents: ${missingCollections.join(', ')}`,
            };
          }

          return {
            status: 'pass' as const,
            message: 'All required collections contain at least one document',
          };
        },
      ),
      runWithTimeout({ id: 'environment-variables', name: 'Environment Variables' }, async () => {
        const envVars = [
          'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
          'FIREBASE_ADMIN_KEY',
          'NEXT_PUBLIC_FIREBASE_API_KEY',
          'RESEND_API_KEY',
          'STRIPE_SECRET_KEY',
          'STRIPE_INVOICE_WEBHOOK_SECRET',
          'EXCHANGE_RATE_API_KEY',
          'NEXT_PUBLIC_DEFAULT_TENANT_ID',
          'NEXT_PUBLIC_SENTRY_DSN',
        ];

        const missing = envVars.filter((envVar) => !process.env[envVar]);
        const hasAppUrl = Boolean(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL);

        if (!hasAppUrl) {
          missing.push('NEXT_PUBLIC_APP_URL or APP_URL');
        }

        if (missing.length > 0) {
          return {
            status: 'fail' as const,
            message: `Missing environment variables: ${missing.join(', ')}`,
            value: missing.length,
          };
        }

        return {
          status: 'pass' as const,
          message: 'All required environment variables are configured',
          value: envVars.length + 1,
        };
      }),
      runWithTimeout({ id: 'env_vars', name: 'Environment Variables' }, async () => {
        const requiredEnv = [
          'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
          'FIREBASE_ADMIN_KEY',
          'STRIPE_SECRET_KEY',
          'STRIPE_WEBHOOK_SECRET',
          'RESEND_API_KEY',
          'NEXT_PUBLIC_SENTRY_DSN',
          'NEXT_PUBLIC_APP_URL',
          'ONBOARDING_FROM_EMAIL',
        ];

        const configured = requiredEnv.filter((key) => Boolean(process.env[key])).length;
        const missing = requiredEnv.length - configured;

        return {
          status:
            missing === 0
              ? ('pass' as const)
              : missing <= 2
                ? ('warning' as const)
                : ('fail' as const),
          message: `${configured}/${requiredEnv.length} required environment variables configured`,
          value: configured,
        };
      }),
      runWithTimeout({ id: 'app_url', name: 'App URL' }, async () => {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

        return {
          status: appUrl.startsWith('https://')
            ? ('pass' as const)
            : appUrl
              ? ('warning' as const)
              : ('fail' as const),
          message: appUrl || 'Not configured',
        };
      }),
      runWithTimeout({ id: 'sentry', name: 'Sentry Error Monitoring' }, async () => {
        const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
        if (!dsn) {
          return {
            status: 'warning' as const,
            message: 'NEXT_PUBLIC_SENTRY_DSN is not set. Error monitoring is disabled.',
            value: 'Not configured',
          };
        }
        if (!dsn.startsWith('https://') || !dsn.includes('@sentry.io')) {
          return {
            status: 'warning' as const,
            message: 'NEXT_PUBLIC_SENTRY_DSN appears to be malformed.',
            value: 'Invalid format',
          };
        }
        return {
          status: 'pass' as const,
          message: 'Sentry DSN is configured. Error monitoring is active.',
          value: dsn.split('@')[1] || 'configured',
        };
      }),
      runWithTimeout({ id: 'stripe-connectivity', name: 'Stripe Connectivity' }, async () => {
        const stripe = getStripeClient();
        const account = await stripe.accounts.retrieve();

        return {
          status: 'pass' as const,
          message: 'Stripe API reachable',
          value: account.id,
        };
      }),
      runWithTimeout({ id: 'resend-connectivity', name: 'Resend Connectivity' }, async () => {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
          return { status: 'fail' as const, message: 'RESEND_API_KEY is not configured' };
        }

        // Instantiate to verify SDK setup in runtime.
        new Resend(apiKey);

        const response = await fetch('https://api.resend.com/domains', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          return {
            status: 'fail' as const,
            message: `Resend API request failed (${response.status})`,
          };
        }

        return {
          status: 'pass' as const,
          message: 'Resend API reachable',
        };
      }),
      runWithTimeout({ id: 'tenant-count', name: 'Tenant Count' }, async () => {
        const countSnap = await adminDb.collection('tenants').count().get();
        const totalTenants = countSnap.data().count;

        return {
          status: 'pass' as const,
          message: 'Tenant count fetched',
          value: totalTenants,
        };
      }),
      runWithTimeout({ id: 'user-count', name: 'User Count' }, async () => {
        const countSnap = await adminDb.collection('users').count().get();
        const totalUsers = countSnap.data().count;

        return {
          status: 'pass' as const,
          message: 'User count fetched',
          value: totalUsers,
        };
      }),
      runWithTimeout({ id: 'default-tenant', name: 'Default Tenant Exists' }, async () => {
        const tenantDoc = await adminDb.collection('tenants').doc(defaultTenantId).get();

        if (!tenantDoc.exists) {
          return {
            status: 'fail' as const,
            message: `Default tenant '${defaultTenantId}' not found`,
            value: defaultTenantId,
          };
        }

        return {
          status: 'pass' as const,
          message: `Default tenant '${defaultTenantId}' exists`,
          value: defaultTenantId,
        };
      }),
    ];

    const settledChecks = await Promise.race([
      Promise.allSettled(checks),
      new Promise<PromiseSettledResult<HealthCheck>[]>((resolve) => {
        setTimeout(() => {
          resolve([]);
        }, ROUTE_TIMEOUT_MS);
      }),
    ]);

    const results = settledChecks.map((settled) => {
      if (settled.status === 'fulfilled') {
        return settled.value;
      }

      return {
        id: 'internal-check-failure',
        name: 'Internal Check Failure',
        status: 'fail' as const,
        message: settled.reason instanceof Error ? settled.reason.message : 'Unknown check failure',
      };
    });

    const summary = summarize(results);

    return NextResponse.json({
      ok: summary.failed === 0,
      checkedAt: new Date().toISOString(),
      summary,
      checks: results,
      sentryConfig: {
        NEXT_PUBLIC_SENTRY_DSN: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
        SENTRY_ORG: Boolean(process.env.SENTRY_ORG),
        SENTRY_PROJECT: Boolean(process.env.SENTRY_PROJECT),
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: Boolean(process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT),
        NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: Boolean(
          process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
        ),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
