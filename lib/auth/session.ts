import crypto from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { AppError } from "@/lib/errors";
import { SESSION_CONFIG } from "@/lib/auth/sessionConfig";

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
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashSessionToken(token: string) {
  return hashToken(token);
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createSession(
  uid: string,
  options: CreateSessionOptions = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = options.sessionCookie;
  if (!token) {
    throw new AppError({
      message: "Session token is required to create a session.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }

  const now = new Date();
  const maxAge = options.rememberMe ? SESSION_CONFIG.rememberMeMaxAge : SESSION_CONFIG.maxAge;
  const expiresAt = new Date(now.getTime() + maxAge);

  const sessionId = hashToken(token);
  const db = getDb(options.db);
  const ref = db.collection("sessions").doc(sessionId);

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
    { merge: true }
  );

  await enforceSessionLimit(uid, token, db);

  return { token, expiresAt };
}

export async function validateSession(
  token: string,
  dbOverride?: Firestore
): Promise<{ valid: boolean; uid?: string; expired?: boolean }> {
  if (!token) return { valid: false };
  const sessionId = hashToken(token);
  const db = getDb(dbOverride);
  const ref = db.collection("sessions").doc(sessionId);
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
    return { valid: false, uid: data.uid, expired: true };
  }

  if (lastActivity && now.getTime() - lastActivity.getTime() > SESSION_CONFIG.idleTimeout) {
    await ref.set({ active: false, revokedAt: now }, { merge: true });
    return { valid: false, uid: data.uid, expired: true };
  }

  return { valid: true, uid: data.uid };
}

export async function refreshSession(token: string, dbOverride?: Firestore): Promise<void> {
  if (!token) return;
  const sessionId = hashToken(token);
  const db = getDb(dbOverride);
  const ref = db.collection("sessions").doc(sessionId);
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
}

export async function invalidateSession(token: string, dbOverride?: Firestore): Promise<void> {
  if (!token) return;
  const sessionId = hashToken(token);
  const db = getDb(dbOverride);
  await db.collection("sessions").doc(sessionId).set(
    {
      active: false,
      revokedAt: new Date(),
    },
    { merge: true }
  );
}

export async function invalidateSessionById(sessionId: string, dbOverride?: Firestore): Promise<void> {
  if (!sessionId) return;
  const db = getDb(dbOverride);
  await db.collection("sessions").doc(sessionId).set(
    {
      active: false,
      revokedAt: new Date(),
    },
    { merge: true }
  );
}

export async function invalidateAllSessions(
  uid: string,
  exceptToken?: string,
  dbOverride?: Firestore
): Promise<void> {
  const db = getDb(dbOverride);
  const query = await db.collection("sessions").where("uid", "==", uid).where("active", "==", true).get();
  const batch = db.batch();
  const exceptId = exceptToken ? hashToken(exceptToken) : null;

  query.docs.forEach((doc) => {
    if (exceptId && doc.id === exceptId) return;
    batch.set(doc.ref, { active: false, revokedAt: new Date() }, { merge: true });
  });

  await batch.commit();
}

export async function getActiveSessions(uid: string, dbOverride?: Firestore): Promise<SessionRecord[]> {
  const db = getDb(dbOverride);
  const now = new Date();
  const snap = await db.collection("sessions").where("uid", "==", uid).where("active", "==", true).get();

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
  dbOverride?: Firestore
): Promise<void> {
  const db = getDb(dbOverride);
  const query = await db
    .collection("sessions")
    .where("uid", "==", uid)
    .where("active", "==", true)
    .orderBy("createdAt", "asc")
    .get();

  const exceptId = exceptToken ? hashToken(exceptToken) : null;
  const docs = query.docs.filter((doc) => !exceptId || doc.id !== exceptId);

  if (docs.length <= SESSION_CONFIG.maxConcurrentSessions) return;

  const excess = docs.length - SESSION_CONFIG.maxConcurrentSessions;
  const batch = db.batch();

  docs.slice(0, excess).forEach((doc) => {
    batch.set(doc.ref, { active: false, revokedAt: new Date() }, { merge: true });
  });

  await batch.commit();
}
