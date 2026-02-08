import { AppError } from "@/lib/errors";

// Sanitize incoming request data to prevent injection attacks

// Strip HTML tags from string values (prevent XSS in stored data)
export function sanitizeString(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }
  if (value && typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

// Deep sanitize an object (recursively sanitize all string values)
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitizedEntries = Object.entries(obj).map(([key, value]) => [
    key,
    sanitizeValue(value),
  ]);
  return Object.fromEntries(sanitizedEntries) as T;
}

// Validate and limit request body size
export function validateBodySize(body: string, maxSizeKB = 100): void {
  // Default max: 100KB for regular requests, 5MB for file uploads
  const maxBytes = maxSizeKB * 1024;
  const bytes = new TextEncoder().encode(body).length;
  if (bytes > maxBytes) {
    throw new AppError({
      message: `Request body exceeds ${maxSizeKB}KB limit.`,
      code: "VALIDATION_ERROR",
      status: 413,
    });
  }
}
