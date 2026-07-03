import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, normalizeRole } from '@/app/api/admin/_utils';
import type { Team, UserProfile } from '@/types/user-management';

export const dynamic = 'force-dynamic';

function canListUsers(role: string) {
  const normalized = normalizeRole(role);
  return (
    normalized === 'admin' ||
    normalized === 'super_admin' ||
    normalized === 'manager' ||
    normalized === 'owner'
  );
}

export async function GET(request: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canListUsers(me.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = new URL(request.url).searchParams;
    const role = searchParams.get('role');
    const teamId = searchParams.get('teamId');
    const status = searchParams.get('status');

    let query = adminDb.collection('users').where('tenantId', '==', me.tenantId);

    if (role) {
      query = query.where('role', '==', role);
    }

    if (status === 'active') {
      query = query.where('isActive', '==', true);
    } else if (status === 'inactive') {
      query = query.where('isActive', '==', false);
    }

    const [usersSnapshot, profilesSnapshot] = await Promise.all([
      query.get(),
      adminDb.collection('user_profiles').where('tenantId', '==', me.tenantId).get(),
    ]);

    const profilesById = new Map(
      profilesSnapshot.docs.map((doc) => [
        doc.id,
        { id: doc.id, ...(doc.data() as Omit<UserProfile, 'id'>) },
      ]),
    );

    let users = usersSnapshot.docs.map((doc) => {
      const data = doc.data();
      const profile = profilesById.get(doc.id);
      return {
        id: doc.id,
        ...data,
        profile,
      };
    });

    if (teamId) {
      const teamDoc = await adminDb.collection('teams').doc(teamId).get();
      if (teamDoc.exists) {
        const team = teamDoc.data() as Team;
        if (team.tenantId !== me.tenantId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const memberIds = team.memberIds || [];
        users = users.filter((user) => memberIds.includes(user.id));
      }
    }

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
