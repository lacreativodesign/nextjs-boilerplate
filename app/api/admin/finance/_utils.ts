import { getCurrentUser, isAdminRole } from '../_utils';
import {
  createFinanceEvent,
  parseNumber,
  parseString,
  queueFinanceEmail,
  serverTimestamp,
  toISO,
} from '@/lib/finance/serverUtils';
import { isPlanAccessError, requireModule } from '../../../lib/plan-enforcement';

export const runtime = 'nodejs';

export async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }
  if (!isAdminRole(me.role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  try {
    await requireModule(me.tenantId, 'finance', { role: me.role });
  } catch (err) {
    if (isPlanAccessError(err)) {
      return { ok: false as const, status: err.status, error: err.message };
    }
    return { ok: false as const, status: 500, error: 'Unable to validate plan access.' };
  }
  return { ok: true as const, user: me };
}

export { createFinanceEvent, parseNumber, parseString, queueFinanceEmail, serverTimestamp, toISO };
