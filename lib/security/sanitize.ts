import { AppError } from '@/lib/errors';

const DEFAULT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const SUSPICIOUS_SIGNATURES = [
  '4d5a', // MZ executable header
  '3c736372697074', // <script
  '504b030414000600', // suspicious macro-enabled office zip signatures
];

export type FileValidationOptions = {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
};

export function sanitizeString(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }
  if (value && typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitizedEntries = Object.entries(obj).map(([key, value]) => [key, sanitizeValue(value)]);
  return Object.fromEntries(sanitizedEntries) as T;
}

export function validateBodySize(body: string, maxSizeKB = 100): void {
  const maxBytes = maxSizeKB * 1024;
  const bytes = new TextEncoder().encode(body).length;
  if (bytes > maxBytes) {
    throw new AppError({
      message: `Request body exceeds ${maxSizeKB}KB limit.`,
      code: 'VALIDATION_ERROR',
      status: 413,
    });
  }
}

export function assertNoSqlInjectionTokens(input: string, fieldName: string): void {
  const dangerousPattern = /(\$where|\$regex|\$ne|\$gt|\$lt|\bunion\b|\bdrop\b|\bdelete\b|--|;)/i;
  if (dangerousPattern.test(input)) {
    throw new AppError({
      message: `Input for ${fieldName} contains prohibited query tokens.`,
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }
}

function toHexSignature(buffer: ArrayBuffer, bytes = 16) {
  const view = new Uint8Array(buffer.slice(0, bytes));
  return Array.from(view)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hasSuspiciousSignature(hex: string): boolean {
  return SUSPICIOUS_SIGNATURES.some((signature) => hex.startsWith(signature));
}

export async function validateUploadedFile(
  file: File,
  options: FileValidationOptions = {},
): Promise<void> {
  const maxSizeBytes = options.maxSizeBytes ?? 5 * 1024 * 1024;
  const allowedMimeTypes = options.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;

  if (!allowedMimeTypes.includes(file.type)) {
    throw new AppError({
      message: 'Unsupported file type.',
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }

  if (file.size > maxSizeBytes) {
    throw new AppError({
      message: `File exceeds the ${(maxSizeBytes / (1024 * 1024)).toFixed(2)}MB limit.`,
      code: 'VALIDATION_ERROR',
      status: 413,
    });
  }

  const signatureHex = toHexSignature(await file.arrayBuffer());
  if (hasSuspiciousSignature(signatureHex)) {
    throw new AppError({
      message: 'Potentially unsafe file content detected.',
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }
}
