import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../admin/_utils';
import { createActivity } from '@/lib/activity/activity-service';
import type { ActivityActionType, ActivityEntityType } from '@/types/activity-feed';

const ALLOWED_ENTITY_TYPES = new Set<ActivityEntityType>([
  'invoice',
  'client',
  'project',
  'task',
  'comment',
  'document',
  'user',
  'payment',
  'system',
]);

export const runtime = 'nodejs';

function parseAction(value: unknown): ActivityActionType | null {
  if (
    value === 'created' ||
    value === 'updated' ||
    value === 'deleted' ||
    value === 'commented' ||
    value === 'assigned'
  ) {
    return value;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, any> | null;
  const action = parseAction(body?.action);
  const entityTypeRaw = String(body?.entity?.type || '').trim() as ActivityEntityType;
  const entityId = String(body?.entity?.id || '').trim();
  const moduleName = String(body?.metadata?.module || '').trim();

  if (
    !action ||
    !entityTypeRaw ||
    !ALLOWED_ENTITY_TYPES.has(entityTypeRaw) ||
    !entityId ||
    !moduleName
  ) {
    return NextResponse.json({ ok: false, error: 'Invalid activity payload.' }, { status: 400 });
  }

  const created = await createActivity({
    tenantId: me.tenantId,
    action,
    actor: {
      uid: me.uid,
      name: me.displayName || me.email || 'Unknown',
      email: me.email || null,
      role: me.role || null,
    },
    entity: {
      type: entityTypeRaw,
      id: entityId,
      name: body?.entity?.name ? String(body.entity.name) : undefined,
    },
    metadata: {
      ...body?.metadata,
      module: moduleName,
      description: body?.metadata?.description ? String(body.metadata.description) : undefined,
    },
  });

  return NextResponse.json({ ok: true, activity: created }, { status: 201 });
}
