import crypto from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { AppError } from '@/lib/errors';
import { SESSION_CONFIG } from '@/lib/auth/sessionConfig';
import {
  CACHE_TTL_SECONDS,
  cacheKeys,
  deleteCached,
  getCached,
  setCached,
} from '@/lib/cache/redis-client';

export { SESSION_CONFIG };

export type SessionRecord = {
  id: string;
  uid: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  ip?: string | null;
  userAgent?: string | null;
  active: boolean;
};

type CreateSessionOptions = {
  rememberMe?: boolean;
  sessionCookie?: string;
  ip?: string | null;
  userAgent?: string | null;
  db?: Firestore;
};

function getDb(db?: Firestore) {
  return db || adminDb;
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function hashSessionToken(token: string) {
  return hashToken(token);
}

type CachedSessionValidation = {
  uid?: string;
  valid: boolean;
  expired?: boolean;
};

function sessionCacheKeyFromToken(token: string) {
  return cacheKeys.session(hashToken(token));
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createSession(
  uid: string,
  options: CreateSessionOptions = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = options.sessionCookie;
  if (!token) {
    throw new AppError({
      message: 'Session token is required to create a session.',
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }

  const now = new Date();
  const maxAge = options.rememberMe ? SESSION_CONFIG.rememberMeMaxAge : SESSION_CONFIG.maxAge;
  const expiresAt = new Date(now.getTime() + maxAge);

  const sessionId = hashToken(token);
  const db = getDb(options.db);
  const ref = db.collection('sessions').doc(sessionId);

  await ref.set(
    {
      uid,
      createdAt: now,
      expiresAt,
      lastActivity: now,
      ip: options.ip || null,
      userAgent: options.userAgent || null,
      active: true,
      tokenHash: sessionId,
      rememberMe: Boolean(options.rememberMe),
    },
    { merge: true },
  );

  // Session-limit enforcement is best-effort cleanup and must NEVER block login. The security-
  // critical part (S8) is the session ledger write (ref.set) above, which stays fail-closed.
  try {
    await enforceSessionLimit(uid, token, db);
  } catch (limitErr) {
    console.error('createSession: session limit enforcement skipped', limitErr);
  }

  await setCached(
    sessionCacheKeyFromToken(token),
    { valid: true, uid, expired: false } satisfies CachedSessionValidation,
    CACHE_TTL_SECONDS.sessions,
    [`user:${uid}:sessions`],
  );

  return { token, expiresAt };
}

export async function validateSession(
  token: string,
  dbOverride?: Firestore,
): Promise<{ valid: boolean; uid?: string; expired?: boolean }> {
  if (!token) return { valid: false };

  const cachedValidation = await getCached<CachedSessionValidation>(
    sessionCacheKeyFromToken(token),
  );
  if (cachedValidation) {
    return cachedValidation;
  }

  const sessionId = hashToken(token);
  const db = getDb(dbOverride);
  const ref = db.collection('sessions').doc(sessionId);
  const snap = await ref.get();

  if (!snap.exists) {
    return { valid: false };
  }

  const data = snap.data() || {};
  if (!data.active) {
    return { valid: false };
  }

  const now = new Date();
  const expiresAt = toDate(data.expiresAt);
  const lastActivity = toDate(data.lastActivity) || toDate(data.createdAt);

  if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
    await ref.set({ active: false, revokedAt: now }, { merge: true });
    const result = { valid: false, uid: data.uid, expired: true };
    await setCached(sessionCacheKeyFromToken(token), result, 60, [`user:${data.uid}:sessions`]);
    return result;
  }

  if (lastActivity && now.getTime() - lastActivity.getTime() > SESSION_CONFIG.idleTimeout) {
    await ref.set({ active: false, revokedAt: now }, { merge: true });
    const result = { valid: false, uid: data.uid, expired: true };
    await setCached(sessionCacheKeyFromToken(token), result, 60, [`user:${data.uid}:sessions`]);
    return result;
  }

  const result = { valid: true, uid: data.uid };
  await setCached(sessionCacheKeyFromToken(token), result, CACHE_TTL_SECONDS.sessions, [
    `user:${data.uid}:sessions`,
  ]);
  return result;
}

export async function refreshSession(token: string, dbOverride?: Firestore): Promise<void> {
  if (!token) return;
  const sessionId = hashToken(token);
  const db = getDb(dbOverride);
  const ref = db.collection('sessions').doc(sessionId);
  const snap = await ref.get();

  if (!snap.exists) return;
  const data = snap.data() || {};
  if (!data.active) return;

  const now = new Date();
  const lastActivity = toDate(data.lastActivity) || toDate(data.createdAt);
  if (lastActivity && now.getTime() - lastActivity.getTime() < 5 * 60 * 1000) {
    return;
  }

  await ref.set({ lastActivity: now }, { merge: true });
  await setCached(
    sessionCacheKeyFromToken(token),
    { valid: true, uid: data.uid, expired: false } satisfies CachedSessionValidation,
    CACHE_TTL_SECONDS.sessions,
    [`user:${data.uid}:sessions`],
  );
}

export async function invalidateSession(token: string, dbOverride?: Firestore): Promise<void> {
  if (!token) return;
  const sessionId = hashToken(token);
  const db = getDb(dbOverride);
  await db.collection('sessions').doc(sessionId).set(
    {
      active: false,
      revokedAt: new Date(),
    },
    { merge: true },
  );
  await deleteCached(cacheKeys.session(sessionId));
}

export async function invalidateSessionById(
  sessionId: string,
  dbOverride?: Firestore,
): Promise<void> {
  if (!sessionId) return;
  const db = getDb(dbOverride);
  await db.collection('sessions').doc(sessionId).set(
    {
      active: false,
      revokedAt: new Date(),
    },
    { merge: true },
  );
  await deleteCached(cacheKeys.session(sessionId));
}

export async function invalidateAllSessions(
  uid: string,
  exceptToken?: string,
  dbOverride?: Firestore,
): Promise<void> {
  const db = getDb(dbOverride);
  const query = await db
    .collection('sessions')
    .where('uid', '==', uid)
    .where('active', '==', true)
    .get();
  const batch = db.batch();
  const exceptId = exceptToken ? hashToken(exceptToken) : null;

  query.docs.forEach((doc) => {
    if (exceptId && doc.id === exceptId) return;
    batch.set(doc.ref, { active: false, revokedAt: new Date() }, { merge: true });
  });

  await batch.commit();
  await Promise.all(
    query.docs
      .filter((doc) => !exceptId || doc.id !== exceptId)
      .map((doc) => deleteCached(cacheKeys.session(doc.id))),
  );
}

export async function getActiveSessions(
  uid: string,
  dbOverride?: Firestore,
): Promise<SessionRecord[]> {
  const db = getDb(dbOverride);
  const now = new Date();
  const snap = await db
    .collection('sessions')
    .where('uid', '==', uid)
    .where('active', '==', true)
    .get();

  const sessions: SessionRecord[] = [];
  const batch = db.batch();
  let hasUpdates = false;

  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const expiresAt = toDate(data.expiresAt);
    const lastActivity = toDate(data.lastActivity) || toDate(data.createdAt) || now;

    const isExpired = !expiresAt || expiresAt.getTime() <= now.getTime();
    const isIdle = now.getTime() - lastActivity.getTime() > SESSION_CONFIG.idleTimeout;

    if (isExpired || isIdle) {
      batch.set(doc.ref, { active: false, revokedAt: now }, { merge: true });
      void deleteCached(cacheKeys.session(doc.id));
      hasUpdates = true;
      return;
    }

    sessions.push({
      id: doc.id,
      uid: data.uid,
      createdAt: toDate(data.createdAt) || now,
      expiresAt,
      lastActivity,
      ip: data.ip || null,
      userAgent: data.userAgent || null,
      active: Boolean(data.active),
    });
  });

  if (hasUpdates) {
    await batch.commit();
  }

  sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  return sessions;
}

export async function enforceSessionLimit(
  uid: string,
  exceptToken?: string,
  dbOverride?: Firestore,
): Promise<void> {
  const db = getDb(dbOverride);
  // Two equality filters only (no orderBy) so this needs NO composite index — a missing
  // sessions(uid, active, createdAt) index made this throw, which S8 surfaced as a login-blocking
  // 500. Sort oldest-first in memory instead; a user has only a handful of sessions.
  const query = await db
    .collection('sessions')
    .where('uid', '==', uid)
    .where('active', '==', true)
    .get();

  const exceptId = exceptToken ? hashToken(exceptToken) : null;
  const docs = query.docs
    .filter((doc) => !exceptId || doc.id !== exceptId)
    .sort((a, b) => {
      const at = toDate(a.data()?.createdAt)?.getTime() ?? 0;
      const bt = toDate(b.data()?.createdAt)?.getTime() ?? 0;
      return at - bt;
    });

  if (docs.length <= SESSION_CONFIG.maxConcurrentSessions) return;

  const excess = docs.length - SESSION_CONFIG.maxConcurrentSessions;
  const batch = db.batch();

  const revoked = docs.slice(0, excess);
  revoked.forEach((doc) => {
    batch.set(doc.ref, { active: false, revokedAt: new Date() }, { merge: true });
  });

  await batch.commit();
  await Promise.all(revoked.map((doc) => deleteCached(cacheKeys.session(doc.id))));
}
