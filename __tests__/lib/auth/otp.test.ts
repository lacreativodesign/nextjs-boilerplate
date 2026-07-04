import { hashOtp, verifyOtp } from '@/lib/auth/otp';

describe('OTP HMAC hashing', () => {
  const OLD = process.env.INTERNAL_REQUEST_SIGNING_SECRET;
  beforeAll(() => {
    process.env.INTERNAL_REQUEST_SIGNING_SECRET = 'test-otp-secret';
  });
  afterAll(() => {
    process.env.INTERNAL_REQUEST_SIGNING_SECRET = OLD;
  });

  it('is deterministic and never returns the plaintext code', () => {
    const h = hashOtp('123456');
    expect(h).toBe(hashOtp('123456'));
    expect(h).not.toContain('123456');
    expect(h).toHaveLength(64);
  });

  it('different codes produce different hashes', () => {
    expect(hashOtp('123456')).not.toBe(hashOtp('654321'));
  });

  it('verifyOtp accepts the correct code and rejects wrong/missing', () => {
    const stored = hashOtp('482915');
    expect(verifyOtp('482915', stored)).toBe(true);
    expect(verifyOtp('000000', stored)).toBe(false);
    expect(verifyOtp('482915', undefined)).toBe(false);
    expect(verifyOtp('482915', '')).toBe(false);
  });

  it('hash changes if the server secret changes (key-bound)', () => {
    const a = hashOtp('111111');
    process.env.INTERNAL_REQUEST_SIGNING_SECRET = 'different-secret';
    const b = hashOtp('111111');
    process.env.INTERNAL_REQUEST_SIGNING_SECRET = 'test-otp-secret';
    expect(a).not.toBe(b);
  });
});
