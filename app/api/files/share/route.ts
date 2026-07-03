import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { FileManager } from '@/lib/files/file-manager';

export const runtime = 'nodejs';

const schema = z.object({
  fileId: z.string().min(1),
  expiresAt: z.string().optional(),
  password: z.string().min(8).max(64).optional(),
  permissions: z.array(z.enum(['view', 'download', 'edit'])).min(1),
});

export async function POST(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = schema.parse(await request.json());
    const file = await FileManager.getFileById(body.fileId, session.tenantId);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    const share = await FileManager.createShare({
      tenantId: session.tenantId,
      fileId: body.fileId,
      createdBy: session.uid,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      password: body.password,
      permissions: body.permissions,
    });

    const origin = new URL(request.url).origin;
    return NextResponse.json({
      shareId: share.id,
      shareLink: `${origin}/shared/file/${share.shareToken}`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create share' },
      { status: 500 },
    );
  }
}
