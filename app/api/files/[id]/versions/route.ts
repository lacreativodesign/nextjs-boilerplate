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
    if (!FileManager.canAccessFile(file, session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const versions = await FileManager.listVersions(params.id, session.tenantId);
    // P0-07: legacy versions carry a 2-day signed preview URL; it never leaves the server.
    return NextResponse.json({ versions: versions.map((version) => withoutStoredUrls(version)) });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load versions' },
      { status: 500 },
    );
  }
}
