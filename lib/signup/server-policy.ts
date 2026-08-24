import { adminDb } from '@/lib/firebaseAdmin';
import { getPublicSignupDenial, readPublicSignupDecision } from './public-signup-policy';

export async function resolvePublicSignupDenial() {
  const decision = await readPublicSignupDecision(() =>
    adminDb.collection('settings').doc('launchChecklist').get(),
  );
  return getPublicSignupDenial(decision);
}
