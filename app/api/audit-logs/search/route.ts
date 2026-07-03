import { NextRequest, NextResponse } from 'next/server';
import { handleModuleSearch } from '@/lib/search/module-search';
import { getCurrentUser } from '@/app/api/admin/_utils';

export const runtime = 'nodejs';

function isAuditViewer(role?: string | null) {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'admin' || normalized === 'super_admin' || normalized === 'owner';
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAuditViewer(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return await handleModuleSearch(
      request,
      session as { uid: string; tenantId: string; role?: string | null },
      {
        module: 'audit_logs',
        collection: 'audit_logs',
        searchFields: ['userEmail', 'userName', 'action', 'resource', 'status', 'resourceId'],
        defaultSortBy: 'timestamp',
        csvFields: [
          'id',
          'timestamp',
          'tenantId',
          'userId',
          'userEmail',
          'userName',
          'action',
          'resource',
          'resourceId',
          'status',
        ],
      },
    );
  } catch (error) {
    console.error('Error searching audit logs:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
