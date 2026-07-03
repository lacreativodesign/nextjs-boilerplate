import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { FileManager } from '@/lib/files/file-manager';

export const runtime = 'nodejs';

const schema = z.object({
  tags: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    )
    .min(1),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = schema.parse(await request.json());
    const file = await FileManager.getFileById(params.id, session.tenantId);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    await FileManager.addTags({
      tenantId: session.tenantId,
      fileId: params.id,
      tags: body.tags,
      createdBy: session.uid,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to add tags' }, { status: 500 });
  }
}
