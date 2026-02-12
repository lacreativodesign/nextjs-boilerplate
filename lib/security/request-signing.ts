export type SecurityEvent = {
  type: string;
  path?: string;
  method?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
};

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function getRotationKeys(): Array<{ id: string; value: string }> {
  const current = process.env.INTERNAL_API_KEY_CURRENT?.trim();
  const previous = process.env.INTERNAL_API_KEY_PREVIOUS?.trim();
  const keys: Array<{ id: string; value: string }> = [];

  if (current) keys.push({ id: "current", value: current });
  if (previous) keys.push({ id: "previous", value: previous });

  return keys;
}

export function verifyRotatingApiKey(candidate: string | null | undefined): { valid: boolean; keyId?: string } {
  if (!candidate) return { valid: false };

  for (const key of getRotationKeys()) {
    if (constantTimeEquals(candidate, key.value)) {
      return { valid: true, keyId: key.id };
    }
  }

  return { valid: false };
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildRequestSignature(payload: string, timestamp: string, secret: string): Promise<string> {
  return hmacSha256Hex(secret, `${timestamp}.${payload}`);
}

export async function verifyRequestSignature(params: {
  payload: string;
  signature: string | null;
  timestamp: string | null;
  secret: string | null;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const {
    payload,
    signature,
    timestamp,
    secret,
    toleranceSeconds = 300,
  } = params;

  if (!signature || !timestamp || !secret) return false;

  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp)) return false;

  const ageSeconds = Math.abs(Date.now() - parsedTimestamp * 1000) / 1000;
  if (ageSeconds > toleranceSeconds) return false;

  const expected = await buildRequestSignature(payload, timestamp, secret);
  return constantTimeEquals(signature, expected);
}
