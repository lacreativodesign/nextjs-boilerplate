import {
  canAccessHr,
  createHrEvent,
  createHrNotification,
  isAdminLike,
  requireHrAccess,
  serverTimestamp,
  toIso,
} from '../admin/hr/_utils';
import { normalizeRole } from '../admin/_utils';

function isHrRole(role?: string | null) {
  const normalizedRole = normalizeRole(role || '');
  return normalizedRole === 'hr' || normalizedRole === 'admin' || normalizedRole === 'super_admin';
}

export {
  canAccessHr,
  createHrEvent,
  createHrNotification,
  isAdminLike,
  isHrRole,
  normalizeRole,
  requireHrAccess,
  serverTimestamp,
  toIso,
};

const ROLE_ROUTES: Record<string, string> = {
  super_admin: '/admin',
  admin: '/admin',
  sales_manager: '/sales_manager',
  sales: '/sales',
  production_manager: '/production_manager',
  am_manager: '/am_manager',
  am: '/am',
  hr: '/hr',
  finance: '/finance',
  production: '/production',
  client: '/client',
};

export function getRouteForRole(role?: string | null) {
  const normalized = normalizeRole(role || '');
  return ROLE_ROUTES[normalized] || '/';
}
