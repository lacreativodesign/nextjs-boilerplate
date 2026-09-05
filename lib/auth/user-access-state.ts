import { adminAuth } from '@/lib/firebaseAdmin';

const ACCESS_DISABLED_STATUSES = new Set([
  'inactive',
  'suspended',
  'disabled',
  'deactivated',
  'terminated',
  'deleted',
]);

export function isUserAccessDisabled(input: {
  status?: unknown;
  isDeleted?: unknown;
  isActive?: unknown;
}): boolean {
  if (input.isDeleted === true) return true;
  if (input.isActive === false) return true;
  const status = String(input.status || 'active').trim().toLowerCase();
  return ACCESS_DISABLED_STATUSES.has(status);
}

/**
 * Keeps Firebase Auth in lockstep with the Firestore identity record. Firestore-backed
 * API guards reject inactive users, but direct Firebase/Firestore clients also rely on
 * Auth state and custom claims. Disabling only the document therefore leaves a second
 * enforcement plane alive. Revoking refresh tokens ends existing sessions immediately.
 */
export async function syncFirebaseUserAccessState(params: {
  uid: string;
  status?: unknown;
  isDeleted?: unknown;
  isActive?: unknown;
}): Promise<{ disabled: boolean }> {
  const disabled = isUserAccessDisabled(params);
  await adminAuth.updateUser(params.uid, { disabled });
  if (disabled) {
    await adminAuth.revokeRefreshTokens(params.uid);
  }
  return { disabled };
}
