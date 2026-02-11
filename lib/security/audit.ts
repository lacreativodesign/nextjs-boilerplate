import { createHmac, timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { getClientIp } from "@/lib/security/rate-limit";

export type MutationAuditPayload = {
  tenantId: string;
  actorUid?: string | null;
  actorRole?: string | null;
  operation: string;
  resource: string;
  resourceId?: string | null;
  method: string;
  path: string;
  metadata?: Record<string, unknown>;
  status: "success" | "failure";
  errorMessage?: string;
};

type ApiKeyRecord = {
  value: string;
  id: string;
};

function getRotationKeys(): ApiKeyRecord[] {
  const primary = process.env.INTERNAL_API_KEY_CURRENT?.trim();
  const previous = process.env.INTERNAL_API_KEY_PREVIOUS?.trim();

  const keys: ApiKeyRecord[] = [];
  if (primary) keys.push({ id: "current", value: primary });
  if (previous) keys.push({ id: "previous", value: previous });
  return keys;
}

export function verifyRotatingApiKey(candidate: string | null | undefined): { valid: boolean; keyId?: string } {
  if (!candidate) return { valid: false };

  const keys = getRotationKeys();
  for (const record of keys) {
    const expected = Buffer.from(record.value);
    const provided = Buffer.from(candidate);

    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      return { valid: true, keyId: record.id };
    }
  }

  return { valid: false };
}

export function buildRequestSignature(payload: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
}

export function verifyRequestSignature(params: {
  payload: string;
  signature: string | null;
  timestamp: string | null;
  secret: string | null;
  toleranceSeconds?: number;
}): boolean {
  const { payload, signature, timestamp, secret, toleranceSeconds = 300 } = params;
  if (!signature || !timestamp || !secret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;

  const ageSeconds = Math.abs(Date.now() - ts * 1000) / 1000;
  if (ageSeconds > toleranceSeconds) return false;

  const expected = buildRequestSignature(payload, timestamp, secret);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function logMutationAudit(req: Request, payload: MutationAuditPayload): Promise<void> {
  try {
    await adminDb.collection("security_audit_logs").add({
      tenantId: payload.tenantId,
      actorUid: payload.actorUid || "anonymous",
      actorRole: payload.actorRole || "unknown",
      operation: payload.operation,
      resource: payload.resource,
      resourceId: payload.resourceId || null,
      method: payload.method,
      path: payload.path,
      status: payload.status,
      errorMessage: payload.errorMessage || null,
      metadata: {
        ...(payload.metadata || {}),
        ip: getClientIp(req),
        userAgent: req.headers.get("user-agent") || "",
        requestId: req.headers.get("x-request-id") || "",
      },
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to persist mutation security audit log", error);
  }
}
