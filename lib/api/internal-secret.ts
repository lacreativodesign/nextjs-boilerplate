import crypto from 'crypto';

/**
 * A-1 — server-to-server secret verification.
 *
 * Three internal endpoints authenticate a caller by comparing an `x-internal-secret`
 * header against an env var. Each rolled its own check with `===`, which short-circuits
 * on the first differing byte and so leaks the secret's prefix through response timing.
 * This module is the single constant-time implementation they all share.
 *
 * It also gives the AI tool bus its own secret. That bus previously authenticated with
 * INTERNAL_REQUEST_SIGNING_SECRET — the same value lib/auth/otp.ts uses to HMAC signup
 * OTPs and middleware uses to sign its subscription cache. One leaked header therefore
 * bought OTP forgery and tenant enumeration at once. The bus secret is now derived from
 * that root with a labelled HMAC, so it is one-way: recovering the bus secret does not
 * recover the root, and OTP hashing is unaffected. Set AI_TOOL_BUS_SECRET to replace the
 * derivation with an independent value; until then callers and verifier derive the same
 * secret from config that is already deployed, so no env change is required to ship.
 */

/** Domain-separation label. Changing it rotates the derived bus secret. */
const AI_TOOL_BUS_LABEL = 'bizosto:ai-tool-bus:v1';

/**
 * Constant-time secret comparison.
 *
 * Both sides are SHA-256 digested first. timingSafeEqual throws on a length mismatch,
 * and that throw is itself an oracle for the secret's length, so hashing to a fixed
 * 32 bytes removes the length signal as well as the byte-by-byte one.
 */
export function secretsMatch(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Minimal shape shared by NextRequest and the standard Request. */
type HeaderBearing = { headers: { get(name: string): string | null } };

/**
 * Verifies the root internal secret. Used by endpoints whose only caller is our own
 * server (middleware, the automation workflow engine).
 */
export function verifyInternalSecret(req: HeaderBearing): boolean {
  return secretsMatch(
    req.headers.get('x-internal-secret'),
    process.env.INTERNAL_REQUEST_SIGNING_SECRET,
  );
}

/**
 * The AI tool bus secret: AI_TOOL_BUS_SECRET when set, otherwise derived from the root.
 * Returns null when neither is configured, so callers and verifier both fail closed.
 */
export function getAiToolBusSecret(): string | null {
  const dedicated = process.env.AI_TOOL_BUS_SECRET;
  if (dedicated) return dedicated;

  const root = process.env.INTERNAL_REQUEST_SIGNING_SECRET;
  if (!root) return null;

  return crypto.createHmac('sha256', root).update(AI_TOOL_BUS_LABEL).digest('hex');
}

/** Verifies a caller of the AI tool bus. */
export function verifyAiToolBusSecret(req: HeaderBearing): boolean {
  return secretsMatch(req.headers.get('x-internal-secret'), getAiToolBusSecret());
}
