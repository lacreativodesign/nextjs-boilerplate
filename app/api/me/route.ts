// app/api/me/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserProfile } from '@/lib/serverAuth';
import { getCurrentUser } from '@/app/api/admin/_utils';

export async function GET() {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const user = await getUserProfile(current.uid);

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user });
}
