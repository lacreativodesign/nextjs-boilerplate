/**
 * Canonical URL construction (P0-4b).
 *
 * Before this module the codebase resolved its own base URL five different ways, and two of
 * them were wrong:
 *
 *   process.env.NEXT_PUBLIC_APP_URL || 'https://app.bizosto.com'          (correct)
 *   process.env.NEXT_PUBLIC_APP_URL || 'https://bizosto.com'              (marketing site)
 *   process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://bizosto.com'
 *   a module-level DASHBOARD_URL constant with no env read at all
 *   fully inlined absolute links inside email HTML with no env read at all
 *
 * bizosto.com is the marketing site. It does not serve /login, /billing or any application
 * route, so every link built from that fallback is a 404 for a customer who is mid-payment
 * or mid-signup. The variants with no env read at all cannot work on a preview deployment.
 *
 * Everything that builds a customer-facing link must use these helpers, and
 * `__tests__/api/v37-link-contract.test.ts` resolves every app link in the repository
 * against the real route tree so a dead link cannot merge.
 */

const APP_FALLBACK = 'https://app.bizosto.com';
const MARKETING_FALLBACK = 'https://bizosto.com';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Base URL of the application (app.bizosto.com), never the marketing site. */
export function getAppUrl(): string {
  const configured = String(process.env.NEXT_PUBLIC_APP_URL || '').trim();
  return trimTrailingSlash(configured || APP_FALLBACK);
}

/** Base URL of the marketing site (bizosto.com). Only for marketing links. */
export function getMarketingUrl(): string {
  const configured = String(process.env.NEXT_PUBLIC_MARKETING_URL || '').trim();
  return trimTrailingSlash(configured || MARKETING_FALLBACK);
}

/** Absolute URL for an in-app path. `path` must start with a slash. */
export function appUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${getAppUrl()}${suffix === '/' ? '' : trimTrailingSlash(suffix)}`;
}

/**
 * Payable invoice link. The payable page is /pay/{invoiceId} and it reads the per-invoice
 * token from the query string — NOT /client/invoices/{id}, which has never existed.
 */
export function invoicePaymentUrl(invoiceId: string, paymentToken?: string | null): string {
  const base = appUrl(`/pay/${encodeURIComponent(invoiceId)}`);
  const token = String(paymentToken || '').trim();
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

/**
 * Approvals queue for a given role.
 *
 * There is no `/approvals` route. The approval pages are role-scoped:
 * /sales_manager/approvals, /am_manager/approvals, /production_manager/approvals.
 * Roles without a queue page (admin, super_admin) get the app root, which redirects to the
 * correct dashboard rather than 404ing.
 */
const APPROVALS_PATH_BY_ROLE: Record<string, string> = {
  sales_manager: '/sales_manager/approvals',
  am_manager: '/am_manager/approvals',
  production_manager: '/production_manager/approvals',
};

export function approvalsPathForRole(role?: string | null): string {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  return APPROVALS_PATH_BY_ROLE[normalized] || '/';
}

export function approvalsUrlForRole(role?: string | null): string {
  return appUrl(approvalsPathForRole(role));
}
