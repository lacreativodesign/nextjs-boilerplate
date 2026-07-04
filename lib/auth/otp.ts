import crypto from 'crypto';

// Signup OTPs are 6 digits (~900k combinations), so a plain hash (e.g. SHA-256) is
// trivially brute-forced or precomputed from a database leak — unlike the 32-byte random
// invite/reset tokens elsewhere. We therefore key the hash with a server-side secret
// (HMAC-SHA256): a Firestore-only leak cannot recover or precompute the code without the
// secret. The OTP itself is never persisted in plaintext.
function otpSecret(): string {
  const secret = process.env.INTERNAL_REQUEST_SIGNING_SECRET;
  if (!secret) {
    throw new Error('INTERNAL_REQUEST_SIGNING_SECRET is not configured');
  }
  return secret;
}

export function hashOtp(otp: string): string {
  return crypto.createHmac('sha256', otpSecret()).update(otp).digest('hex');
}

export function verifyOtp(otp: string, storedHash: unknown): boolean {
  if (typeof storedHash !== 'string' || storedHash.length === 0) return false;
  const computed = hashOtp(otp);
  // Both are fixed-length hex; guard length before timingSafeEqual (which throws on mismatch).
  if (computed.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
}
