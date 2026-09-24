import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { FileManager } from '@/lib/files/file-manager';
import { withoutStoredUrls } from '@/lib/storage/stored-urls';

export const runtime = 'nodejs';

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const file = await FileManager.getFileById(params.id, session.tenantId);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    // P0-07: the stored ACL applies to reading the record too, and a legacy signed preview
    // URL never leaves the server.
    if (!FileManager.canAccessFile(file, session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ file: withoutStoredUrls(file) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load file' }, { status: 500 });
  }
}
