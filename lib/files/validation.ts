import { validateSignature } from '@/lib/files/signatures';

const ALLOWED_EXTENSIONS = new Set([
  // Documents
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'txt',
  'rtf',
  'odt',
  'ods',
  // Images
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  // Presentations
  'ppt',
  'pptx',
  // Archives
  'zip',
  'rar',
  // Design
  'psd',
  'ai',
  'eps',
  'fig',
  'sketch',
]);

const BLOCKED_EXTENSIONS = new Set([
  // SEC-006: SVG is an executable document (inline <script>, foreignObject, xlink) and
  // was previously served from a signed Storage URL on our own origin. Blocked until a
  // sanitiser and a sandboxed serving path exist.
  'svg',
  'exe',
  'bat',
  'cmd',
  'sh',
  'ps1',
  'msi',
  'dll',
  'com',
  'scr',
  'js',
  'vbs',
  'wsf',
  'php',
  'py',
  'rb',
  'pl',
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export function validateFile(
  filename: string,
  sizeBytes: number,
): { valid: boolean; error?: string } {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `File type .${ext} is not allowed for security reasons` };
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File type .${ext} is not supported. Allowed: documents, images, presentations, archives`,
    };
  }

  if (sizeBytes > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size ${(sizeBytes / 1024 / 1024).toFixed(1)}MB exceeds maximum of 25MB`,
    };
  }

  return { valid: true };
}

/**
 * SEC-004: the pre-flight `validateFile` check only sees the CLIENT-DECLARED size and
 * filename. This second gate runs on the ASSEMBLED buffer, so it is the only check that
 * sees what was really uploaded:
 *   - real byte length against the 25MB ceiling (a caller could declare 1MB and send 200MB)
 *   - real byte length against the declared size
 *   - magic bytes against the claimed extension
 */
export function validateAssembledFile(
  buffer: Buffer,
  filename: string,
  declaredSizeBytes: number,
): { valid: boolean; error?: string } {
  const actualSize = buffer.length;

  const nameCheck = validateFile(filename, actualSize);
  if (!nameCheck.valid) return nameCheck;

  if (Number.isFinite(declaredSizeBytes) && actualSize !== declaredSizeBytes) {
    return {
      valid: false,
      error: `Uploaded size ${actualSize} bytes does not match the declared size ${declaredSizeBytes} bytes`,
    };
  }

  return validateSignature(buffer, filename);
}

export { MAX_FILE_SIZE };
