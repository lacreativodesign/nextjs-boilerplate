import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminRole } from '../../_utils';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { message } = body;

    if (!message) {
      return new NextResponse('Missing message', { status: 400 });
    }

    await adminDb.collection('activity').add({
      message,
      tenantId: current.tenantId,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Error saving activity:', e);
    return new NextResponse('Server error', { status: 500 });
  }
}
