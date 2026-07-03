import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { TaskService } from '@/lib/projects/task-service';
import { getCurrentUser } from '@/app/api/admin/_utils';
import type { TimeEntry } from '@/types/project-management';

const stopSchema = z.object({
  entryId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entryId } = stopSchema.parse(await request.json());

    const entryDoc = await adminDb.collection('time_entries').doc(entryId).get();
    if (!entryDoc.exists) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    const entry = entryDoc.data() as TimeEntry;
    if (entry.tenantId !== me.tenantId || entry.userId !== me.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await TaskService.stopTimer(entryId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error stopping timer:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stop timer' },
      { status: 500 },
    );
  }
}
