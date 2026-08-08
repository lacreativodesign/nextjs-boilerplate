export const ERP_ROLES = [
  'super_admin',
  'admin',
  'sales_manager',
  'sales',
  'am_manager',
  'am',
  'production_manager',
  'production',
  'finance',
  'hr',
  'client',
] as const;

export type ErpRole = (typeof ERP_ROLES)[number];

export const ROLE_DASHBOARD_ROUTE: Record<ErpRole, string> = {
  super_admin: '/super_admin',
  admin: '/dashboard',
  sales_manager: '/sales_manager',
  sales: '/sales',
  am_manager: '/am_manager',
  am: '/am',
  production_manager: '/production_manager',
  production: '/production',
  finance: '/finance',
  hr: '/hr',
  client: '/client',
};

export type NavItem = { label: string; href: string };

const ERP_MENU: NavItem[] = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Sales', href: '/sales' },
  { label: 'Finance', href: '/finance' },
  { label: 'Production', href: '/production' },
  { label: 'HR', href: '/hr' },
  { label: 'Client Portal', href: '/client' },
  { label: 'Platform', href: '/super_admin' },
];

const CLIENT_MENU: NavItem[] = [
  { label: 'Overview', href: '/client' },
  { label: 'Projects', href: '/client' },
  { label: 'Billing', href: '/client' },
  { label: 'Profile', href: '/client' },
];

export function normalizeRole(role?: string | null): ErpRole | null {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/^account_manager$/, 'am');

  return (ERP_ROLES as readonly string[]).includes(normalized) ? (normalized as ErpRole) : null;
}

export function menuForRole(role?: string | null): NavItem[] {
  const normalized = normalizeRole(role);
  if (!normalized) return [];

  if (normalized === 'client') return CLIENT_MENU;
  if (normalized === 'super_admin') return [{ label: 'Platform Overview', href: '/super_admin' }];

  return ERP_MENU.filter((item) => {
    if (item.href === '/super_admin') return false;
    if (normalized === 'sales' && item.href === '/finance') return false;
    if (normalized === 'production' && item.href === '/finance') return false;
    return true;
  });
}

export function roleFromPath(pathname: string): ErpRole | null {
  const entries = Object.entries(ROLE_DASHBOARD_ROUTE) as Array<[ErpRole, string]>;
  const match = entries.find(([, route]) => pathname === route || pathname.startsWith(`${route}/`));
  return match?.[0] || null;
}

export function rolesAllowedForApi(pathname: string): ErpRole[] | null {
  if (pathname.startsWith('/api/super_admin')) return ['super_admin'];
  if (pathname.startsWith('/api/admin')) return ['admin', 'super_admin'];
  if (pathname.startsWith('/api/sales_manager')) return ['sales_manager', 'admin', 'super_admin'];
  if (pathname.startsWith('/api/sales')) return ['sales', 'sales_manager', 'admin', 'super_admin'];
  if (pathname.startsWith('/api/am_manager')) return ['am_manager', 'admin', 'super_admin'];
  if (pathname.startsWith('/api/am')) return ['am', 'am_manager', 'admin', 'super_admin'];
  if (pathname.startsWith('/api/production_manager'))
    return ['production_manager', 'admin', 'super_admin'];
  if (pathname.startsWith('/api/production'))
    return ['production', 'production_manager', 'admin', 'super_admin'];
  if (pathname.startsWith('/api/finance')) return ['finance', 'admin', 'super_admin'];
  if (pathname.startsWith('/api/hr')) return ['hr', 'admin', 'super_admin'];
  // F-1: `/api/clients` (plural, the internal CRM surface) must be tested BEFORE
  // `/api/client` (singular, the external customer portal), because the portal
  // prefix is a prefix of the CRM one. With the old ordering `/api/clients/search`
  // matched the portal rule, which allowed the `client` role into the tenant's full
  // client list and blocked the sales and AM roles that actually own it.
  if (pathname.startsWith('/api/clients'))
    return ['sales', 'sales_manager', 'am', 'am_manager', 'admin', 'super_admin'];
  if (pathname.startsWith('/api/client')) return ['client', 'admin', 'super_admin'];
  if (pathname.startsWith('/api/crm'))
    return ['sales', 'sales_manager', 'am', 'am_manager', 'admin', 'super_admin'];
  // F-1: search fans out across every module, so the client role — the tenant's own
  // external customers — is kept out at the edge. Which modules an internal role can
  // actually see is decided per-domain in lib/search/search-access.ts.
  if (pathname.startsWith('/api/search'))
    return ERP_ROLES.filter((role) => role !== 'client') as ErpRole[];
  // F-2: bulk data movement. /api/import/* and /api/export/* move whole entity
  // collections in and out of a tenant, so they are administrative operations and
  // must be gated at the edge as well as in the handler. Before this, both
  // namespaces fell through to `null` — no middleware layer at all — which is how
  // three unguarded import routes and the export route shipped.
  if (pathname.startsWith('/api/import')) return ['admin', 'super_admin'];
  if (pathname.startsWith('/api/export')) return ['admin', 'super_admin'];
  return null;
}
