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
  'svg',
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
