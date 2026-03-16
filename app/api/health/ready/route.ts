import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await adminDb.collection('settings').doc('platform').get();
    return NextResponse.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: { firestore: 'ok' },
    });
  } catch {
    return NextResponse.json(
      { status: 'not_ready', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
