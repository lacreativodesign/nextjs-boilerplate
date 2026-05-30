import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { deleteSavedAdvancedSearch } from '@/lib/search/advanced-search';

export const runtime = 'nodejs';

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId || !session.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const deleted = await deleteSavedAdvancedSearch({
      tenantId: session.tenantId,
      uid: session.uid,
      id: params.id,
    });

    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('Delete saved advanced search error', error);
    return NextResponse.json({ error: 'Failed to delete saved search' }, { status: 500 });
  }
}
