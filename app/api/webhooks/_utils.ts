import { z } from 'zod';
import { getCurrentUser, isAdminRole } from '@/app/api/admin/_utils';
import { WEBHOOK_EVENT_TYPES } from '@/lib/webhooks/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const webhookSubscriptionSchema = z.object({
  url: z.string().url().max(2000),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
  secret: z.string().min(16).max(256),
  status: z.enum(['active', 'disabled']).default('active'),
  description: z.string().max(500).optional().nullable(),
});

export async function requireWebhookAdmin() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, status: 401, error: 'Unauthorized' };
  if (!isAdminRole(user.role)) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, user };
}
