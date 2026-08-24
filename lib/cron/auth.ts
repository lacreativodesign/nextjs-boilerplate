import { timingSafeEqual } from 'crypto';

export type CronAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 500; code: 'UNAUTHORIZED' | 'CRON_SECRET_MISCONFIGURED' };

const INVALID_SECRETS = new Set(['', 'change-me-in-production']);
const MINIMUM_SECRET_LENGTH = 32;

export function isSecureCronSecret(secret: string | undefined): secret is string {
  if (typeof secret !== 'string') return false;
  const trimmed = secret.trim();
  return (
    secret === trimmed &&
    !/\s/.test(secret) &&
    trimmed.length >= MINIMUM_SECRET_LENGTH &&
    !INVALID_SECRETS.has(trimmed)
  );
}

/**
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` for configured cron jobs.
 * The x-vercel-cron header is metadata, not a credential, and is never trusted.
 */
export function authorizeCronRequest(
  request: Pick<Request, 'headers'>,
  secret: string | undefined = process.env.CRON_SECRET,
): CronAuthorization {
  if (!isSecureCronSecret(secret)) {
    return { ok: false, status: 500, code: 'CRON_SECRET_MISCONFIGURED' };
  }

  const supplied = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  const matches =
    suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);

  return matches ? { ok: true } : { ok: false, status: 401, code: 'UNAUTHORIZED' };
}
