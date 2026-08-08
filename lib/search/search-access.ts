import { ERP_ROLES, normalizeRole, type ErpRole } from '@/lib/erpAccess';

/**
 * Role visibility for search (F-1).
 *
 * The search subsystem reached nine collections — users, customers, projects,
 * invoices, documents, payments, expenses, products and the denormalized search
 * index — and scoped every query by `tenantId` alone. `SearchSession` declared a
 * `role` field that was never read, so search became a single endpoint that
 * returned any module's data to any role, including `client`, which belongs to the
 * tenant's own external customers. Because `format: 'csv'` is supported, that was
 * also a one-request bulk export of the finance ledger.
 *
 * This table is the one place that decides which role may search which data domain.
 * It is deliberately explicit rather than derived: the module keys used by
 * `handleModuleSearch` and by `globalSearch` are not identical to API namespaces, so
 * inferring the rule would hide it. `search-authorization.test.ts` asserts that the
 * domains which DO map onto an API namespace stay consistent with
 * `rolesAllowedForApi`, so the two layers cannot drift apart.
 *
 * Rule of thumb when adding a domain: start from the role set that governs the same
 * data everywhere else in the app, and never include `client`.
 */

/** Every searchable data domain, across module search and global search. */
export const SEARCH_DOMAINS = [
  'audit_logs',
  'clients',
  'customers',
  'documents',
  'expenses',
  'inventory',
  'invoices',
  'payments',
  'products',
  'projects',
  'search_index',
  'users',
] as const;

export type SearchDomain = (typeof SEARCH_DOMAINS)[number];

/** Every role except `client`. Client-portal users search through their own scoped routes. */
const INTERNAL_ROLES: ErpRole[] = ERP_ROLES.filter((role) => role !== 'client');

const ADMIN_ONLY: ErpRole[] = ['admin', 'super_admin'];
const FINANCE_ROLES: ErpRole[] = ['finance', 'admin', 'super_admin'];
const CRM_ROLES: ErpRole[] = ['sales', 'sales_manager', 'am', 'am_manager', 'admin', 'super_admin'];
const CATALOG_ROLES: ErpRole[] = [
  'sales',
  'sales_manager',
  'production',
  'production_manager',
  'admin',
  'super_admin',
];

export const SEARCH_DOMAIN_ROLES: Record<SearchDomain, ErpRole[]> = {
  // Staff directory exposes name, email and role. Already admin-gated at
  // /api/users/search; this keeps that rule when reached through any other path.
  users: ADMIN_ONLY,
  // Audit trail is an administrative record of everyone's actions.
  audit_logs: ADMIN_ONLY,
  // Denormalized cross-module index. Rows carry a `module` field but no reliable
  // per-row entitlement, so it cannot be filtered safely and fails closed.
  // (Nothing currently writes to this collection — `indexDocument` has no callers.)
  search_index: ADMIN_ONLY,
  // Financial records.
  invoices: FINANCE_ROLES,
  payments: FINANCE_ROLES,
  expenses: FINANCE_ROLES,
  // Customer and client records — the CRM surface.
  clients: CRM_ROLES,
  customers: CRM_ROLES,
  // Product catalog: sales quote from it, production builds against it.
  // `products` and `inventory` are the same collection under two module keys.
  products: CATALOG_ROLES,
  inventory: CATALOG_ROLES,
  // Shared internal work objects. Clients read their own through /api/client/*.
  projects: INTERNAL_ROLES,
  documents: INTERNAL_ROLES,
};

function isSearchDomain(value: string): value is SearchDomain {
  return (SEARCH_DOMAINS as readonly string[]).includes(value);
}

/**
 * Whether `role` may search `domain`.
 *
 * Fails closed: an unknown role, an absent role, or a domain missing from the table
 * all return false, so a newly added search module is unreachable until it is
 * explicitly given a role set here.
 */
export function canSearchDomain(role: string | null | undefined, domain: string): boolean {
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  if (!isSearchDomain(domain)) return false;
  return SEARCH_DOMAIN_ROLES[domain].includes(normalized);
}

/** The subset of `domains` that `role` may search. Empty when the role is unknown. */
export function visibleSearchDomains<T extends string>(
  role: string | null | undefined,
  domains: readonly T[],
): T[] {
  return domains.filter((domain) => canSearchDomain(role, domain));
}
