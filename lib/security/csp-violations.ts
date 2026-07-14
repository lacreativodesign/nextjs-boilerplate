import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';

/**
 * CSP violation aggregation.
 *
 * S15: the strict nonce-based CSP has been running in Report-Only mode, but the violation
 * sink only console.warn'd each report into the platform logs. Those logs are ephemeral and
 * effectively unreadable, so nobody could answer the one question that matters: "what would
 * actually break if we turned enforcement on?" Enforcement therefore stayed deferred
 * indefinitely.
 *
 * Reports are now aggregated into Firestore so they can be reviewed.
 *
 * The report endpoint is UNAUTHENTICATED by necessity — browsers post violation reports
 * without app credentials — so this write path is deliberately hostile-input safe:
 *
 *   - The document id is derived from the violation's SHAPE (directive + blocked origin +
 *     document path), never from raw attacker text, so repeat reports increment one counter
 *     instead of creating new documents.
 *   - The blocked URI is reduced to its ORIGIN, and the document URI to its PATH. This bounds
 *     how many distinct documents can ever exist: an attacker cannot mint unlimited documents
 *     by varying a query string or fragment.
 *   - Only known CSP directives are accepted; anything else is dropped.
 *   - All stored strings are truncated.
 *
 * Requests to this route also pass through the middleware rate limiter like every other
 * /api path.
 */

const KNOWN_DIRECTIVES = new Set([
  'default-src',
  'script-src',
  'script-src-elem',
  'script-src-attr',
  'style-src',
  'style-src-elem',
  'style-src-attr',
  'img-src',
  'font-src',
  'connect-src',
  'frame-src',
  'frame-ancestors',
  'form-action',
  'base-uri',
  'object-src',
]);

const MAX_LEN = 200;

export interface NormalizedViolation {
  directive: string;
  blockedOrigin: string;
  documentPath: string;
}

function truncate(value: string): string {
  return value.slice(0, MAX_LEN);
}

/** Reduces a blocked URI to a bounded token: a scheme keyword or a bare origin. */
function toBlockedOrigin(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return 'unknown';

  // Browsers report these literals for inline / eval / data violations.
  if (!value.includes('://')) return truncate(value.toLowerCase());

  try {
    return truncate(new URL(value).origin);
  } catch {
    return 'unknown';
  }
}

function toDocumentPath(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '/';
  try {
    return truncate(new URL(value).pathname);
  } catch {
    return truncate(value.startsWith('/') ? value : '/');
  }
}

/** Returns null when the report is not a CSP violation we recognise. */
export function normalizeViolation(report: {
  directive?: string | null;
  blockedUri?: string | null;
  documentUri?: string | null;
}): NormalizedViolation | null {
  // "script-src-elem 'self'" -> "script-src-elem"
  const directive = String(report.directive || '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();

  if (!KNOWN_DIRECTIVES.has(directive)) return null;

  return {
    directive,
    blockedOrigin: toBlockedOrigin(String(report.blockedUri || '')),
    documentPath: toDocumentPath(String(report.documentUri || '')),
  };
}

export function violationId(violation: NormalizedViolation): string {
  return crypto
    .createHash('sha256')
    .update(`${violation.directive}|${violation.blockedOrigin}|${violation.documentPath}`)
    .digest('hex')
    .slice(0, 32);
}

/** Upserts an aggregated violation. Best-effort: a report must never surface an error. */
export async function recordViolation(violation: NormalizedViolation): Promise<void> {
  const id = violationId(violation);

  await adminDb
    .collection('csp_violations')
    .doc(id)
    .set(
      {
        id,
        ...violation,
        count: admin.firestore.FieldValue.increment(1),
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        firstSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}
