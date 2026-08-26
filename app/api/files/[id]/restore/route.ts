import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { FileManager } from '@/lib/files/file-manager';

export const runtime = 'nodejs';

const bodySchema = z.object({
  versionId: z.string().min(1),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = bodySchema.parse(await request.json());
    const file = await FileManager.getManageableFileById(params.id, {
      tenantId: session.tenantId,
      uid: session.uid,
      role: session.role,
    });
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    await FileManager.restoreVersion({
      tenantId: session.tenantId,
      fileId: params.id,
      versionId: body.versionId,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to restore version' },
      { status: 500 },
    );
  }
}
