import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { getWidgetById } from '@/lib/dashboard/dashboard-service';
import { getWidgetData } from '@/lib/dashboard/widget-manager';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const widget = await getWidgetById(user.tenantId, user.uid, params.id);
    if (!widget) return NextResponse.json({ error: 'Widget not found' }, { status: 404 });

    const data = await getWidgetData(widget);
    return NextResponse.json({ ok: true, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch widget data' },
      { status: 500 },
    );
  }
}
