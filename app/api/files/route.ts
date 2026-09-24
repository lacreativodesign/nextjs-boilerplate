import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { FileManager } from '@/lib/files/file-manager';
import { withoutStoredUrls } from '@/lib/storage/stored-urls';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const files = await FileManager.listFiles({
      tenantId: session.tenantId,
      folderId: searchParams.get('folderId') || undefined,
      tag: searchParams.get('tag') || undefined,
      q: searchParams.get('q') || undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
    });

    // P0-07: only files this caller may open (the stored ACL), and without the legacy
    // 2-day signed preview URL older records still carry.
    return NextResponse.json({
      files: files
        .filter((file) => FileManager.canAccessFile(file, session))
        .map((file) => withoutStoredUrls(file)),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to list files' }, { status: 500 });
  }
}
