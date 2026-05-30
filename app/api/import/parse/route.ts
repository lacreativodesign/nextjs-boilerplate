import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdminOrSuper } from '@/app/api/admin/_utils';
import { parseFile } from '@/lib/import/parser';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminOrSuper(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No valid file provided' }, { status: 400 });
    }

    const { headers, rows } = await parseFile(file);

    return NextResponse.json({ headers, rows: rows.slice(0, 100), totalRows: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
