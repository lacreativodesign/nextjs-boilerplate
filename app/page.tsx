import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getRoleRoute } from '@/lib/roleRouting';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = cookies().get('lac_session')?.value;

  if (!session) {
    redirect('/login');
  }

  try {
    const decoded = await adminAuth.verifySessionCookie(session, true);
    const uid = decoded.uid;
    const snap = await adminDb.collection('users').doc(uid).get();
    const role = (snap.data()?.role || '').toString().toLowerCase();

    redirect(getRoleRoute(role));
  } catch {
    redirect('/login');
  }
}
