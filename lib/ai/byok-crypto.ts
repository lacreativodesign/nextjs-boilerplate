import crypto from 'crypto';

/**
 * BYOK API-key encryption at rest (AI-0a).
 *
 * Tenant-supplied provider API keys (OpenAI / Anthropic) were stored in
 * Firestore in plaintext. They are now encrypted with AES-256-GCM before
 * storage and decrypted only server-side, at call time. The ciphertext format
 * matches the existing integration-token convention in lib/integrations:
 * base64( iv[12] || authTag[16] || ciphertext ), so operators manage one style
 * of encryption key across the platform.
 *
 * Key source: AI_BYOK_ENCRYPTION_KEY (32 bytes, hex or base64). Values encrypted
 * with this helper are prefixed with "enc:v1:" so we can distinguish encrypted
 * values from any legacy plaintext keys still in the datastore and migrate them
 * transparently on next read/write.
 */

const ENC_PREFIX = 'enc:v1:';

function getEncryptionKey(): Buffer {
  const raw = String(process.env.AI_BYOK_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    throw new Error('AI_BYOK_ENCRYPTION_KEY is required to store BYOK API keys.');
  }
  const key =
    raw.length === 64 && /^[a-fA-F0-9]+$/.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('AI_BYOK_ENCRYPTION_KEY must decode to 32 bytes.');
  }
  return key;
}

/** True if the stored value is an encrypted payload produced by this helper. */
export function isEncryptedApiKey(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * Decrypts a stored key. Backward-compatible: if the value is NOT in the
 * encrypted format (a legacy plaintext key written before AI-0a), it is
 * returned as-is so existing tenants keep working until their next key save
 * re-encrypts it.
 */
export function decryptApiKey(stored: string): string {
  if (!isEncryptedApiKey(stored)) {
    return stored;
  }
  const key = getEncryptionKey();
  const payload = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const enc = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
