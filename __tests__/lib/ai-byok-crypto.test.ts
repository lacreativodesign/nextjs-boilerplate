import * as fs from 'fs';
import * as path from 'path';

/**
 * BYOK API-key encryption gate (AI-0a).
 *
 * Tenant provider API keys were stored in Firestore in plaintext. They are now
 * encrypted with AES-256-GCM before storage and decrypted only server-side at
 * call time. These tests cover the crypto round-trip, tamper detection, legacy
 * plaintext passthrough, and static assertions that the settings route encrypts
 * on write and the single read path decrypts.
 */

// 32-byte hex key for the test (never a real key).
process.env.AI_BYOK_ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import { encryptApiKey, decryptApiKey, isEncryptedApiKey } from '@/lib/ai/byok-crypto';

describe('BYOK key encryption round-trip', () => {
  it('encrypts then decrypts back to the original key', () => {
    const key = 'sk-ant-api03-EXAMPLE-do-not-use-1234567890';
    const enc = encryptApiKey(key);
    expect(enc).not.toContain(key);
    expect(isEncryptedApiKey(enc)).toBe(true);
    expect(decryptApiKey(enc)).toBe(key);
  });

  it('produces different ciphertext each time (random IV) but same plaintext', () => {
    const key = 'sk-EXAMPLE-openai-1234567890abcdef';
    const a = encryptApiKey(key);
    const b = encryptApiKey(key);
    expect(a).not.toBe(b);
    expect(decryptApiKey(a)).toBe(key);
    expect(decryptApiKey(b)).toBe(key);
  });

  it('returns legacy plaintext values unchanged (backward compatible)', () => {
    const legacy = 'sk-ant-legacy-plaintext-key-value';
    expect(isEncryptedApiKey(legacy)).toBe(false);
    expect(decryptApiKey(legacy)).toBe(legacy);
  });

  it('fails to decrypt tampered ciphertext (GCM auth tag)', () => {
    const enc = encryptApiKey('sk-ant-tamper-target-1234567890');
    // Flip a character in the base64 body to corrupt the ciphertext.
    const prefix = 'enc:v1:';
    const body = enc.slice(prefix.length);
    const flipped = prefix + (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
    expect(() => decryptApiKey(flipped)).toThrow();
  });
});

describe('BYOK encryption is wired into storage and read paths (static gate)', () => {
  const read = (relative: string): string =>
    fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  it('settings route encrypts the key on write and never stores it raw', () => {
    const source = read('app/api/admin/settings/ai-workforce/route.ts');
    expect(source).toContain('encryptApiKey(key)');
    // The old plaintext write is gone.
    expect(source).not.toContain('apiKey: key,');
  });

  it('settings route masks using the decrypted value, never returns plaintext', () => {
    const source = read('app/api/admin/settings/ai-workforce/route.ts');
    // GET returns only a mask + hasKey; no field returns the raw/decrypted key.
    expect(source).toContain('apiKeyMasked');
    expect(source).not.toMatch(/apiKey:\s*decryptApiKey/);
    expect(source).not.toMatch(/apiKey:\s*String\(data\.apiKey\)/);
  });

  it('the single read path decrypts before use', () => {
    const source = read('lib/ai/agent-task.ts');
    expect(source).toContain('decryptApiKey(String(data.apiKey))');
  });
});
