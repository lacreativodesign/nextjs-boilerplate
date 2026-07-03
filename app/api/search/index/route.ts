import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { indexDocument } from '@/lib/search/global-search';

export const runtime = 'nodejs';

const bodySchema = z.object({
  id: z.string().optional(),
  module: z.string().trim().min(1),
  title: z.string().trim().min(1),
  content: z.string().optional(),
  status: z.string().optional(),
  href: z.string().trim().min(1),
  createdAt: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId || !session.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = bodySchema.parse(await request.json());
    const id = await indexDocument({ ...payload, tenantId: session.tenantId });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('Index document error', error);
    return NextResponse.json({ error: 'Failed to index document' }, { status: 500 });
  }
}
