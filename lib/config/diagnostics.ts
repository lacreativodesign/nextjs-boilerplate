import { inspectFirebaseProjectIsolation } from '@/lib/config/firebase-environment';
import { inspectSubscriptionPriceConfig } from '@/lib/config/subscription-prices';

/**
 * Safe operational diagnostics. This object contains booleans, states, error codes,
 * and variable names only. It never contains credentials or configured values.
 */
export function getSafeConfigurationDiagnostics(env: NodeJS.ProcessEnv = process.env) {
  return {
    firebase: inspectFirebaseProjectIsolation(env),
    subscriptionPrices: inspectSubscriptionPriceConfig(env),
    cronSecretConfigured: Boolean(env.CRON_SECRET && env.CRON_SECRET !== 'change-me-in-production'),
    transactionalEmailConfigured: Boolean(env.RESEND_API_KEY),
  } as const;
}
