import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { removeWidget } from '@/lib/dashboard/dashboard-service';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const removed = await removeWidget(user.tenantId, user.uid, params.id);
    if (!removed) return NextResponse.json({ error: 'Widget not found' }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to delete widget' },
      { status: 500 },
    );
  }
}
