import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { listSavedAdvancedSearches } from '@/lib/search/advanced-search';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId || !session.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searches = await listSavedAdvancedSearches({
      tenantId: session.tenantId,
      uid: session.uid,
    });
    return NextResponse.json({ searches });
  } catch (error) {
    console.error('List saved advanced searches error', error);
    return NextResponse.json({ error: 'Failed to list saved searches' }, { status: 500 });
  }
}
