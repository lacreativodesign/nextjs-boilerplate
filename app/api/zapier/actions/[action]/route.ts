import { NextRequest, NextResponse } from 'next/server';
import { executeZapierAction } from '@/lib/zapier/service';
import { requireZapierApiKey } from '@/app/api/zapier/_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { action: string } }) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const auth = await requireZapierApiKey(request, body);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const input = (body.input as Record<string, unknown>) || body;
    const result = await executeZapierAction({
      tenantId: auth.tenantId,
      action: params.action,
      input,
    });

    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Action failed.' },
      { status: 400 },
    );
  }
}
