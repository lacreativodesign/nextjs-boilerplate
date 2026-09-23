import crypto from 'crypto';
import { adminStorage } from '@/lib/firebaseAdmin';
import { getStorageBucketName } from '@/lib/storage/bucket';

/**
 * Screenshot handling for platform tickets.
 *
 * Screenshots are uploaded to Cloud Storage and referenced by URL on the ticket
 * document — never stored inline as base64. Inline base64 was guaranteed to blow
 * Firestore's 1 MiB document limit on real captures and bloated every ticket read.
 *
 * The bucket path is namespaced by tenant so a screenshot inherits the same
 * isolation boundary as the rest of that tenant's data.
 */

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/;

/** Hard ceiling on the decoded image. The client downscales to ~1280px JPEG; this is the backstop. */
const MAX_DECODED_BYTES = 3 * 1024 * 1024; // 3MB

/**
 * The same ceiling expressed in data-URL characters, so an oversized payload is rejected
 * BEFORE it reaches the regex or the base64 allocator.
 *
 * Base64 encodes 3 bytes per 4 characters, so anything longer than this cannot decode under
 * MAX_DECODED_BYTES. Checking length first means unbounded, caller-controlled input never
 * drives a backtracking regex or a multi-megabyte Buffer allocation merely to be told it was
 * too big — that work was always going to be thrown away.
 *
 * This began as a CI failure: on a memory-constrained runner the ~3.93MB allocation below
 * failed with `RangeError` before the size check could report `ScreenshotTooLarge`, so the
 * test asserting the rejection saw the wrong error. Raising the runner's V8 old-space did not
 * help and could not have — Buffer allocations are external to it. Not allocating at all is
 * the fix that does not depend on knowing which allocator ran out of room.
 *
 * The 64-character allowance covers the `data:image/…;base64,` prefix.
 */
const MAX_DATA_URL_CHARS = Math.ceil(MAX_DECODED_BYTES / 3) * 4 + 64;

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

export type ParsedScreenshot = {
  buffer: Buffer;
  contentType: string;
  ext: string;
};

/**
 * Validate and decode a base64 data URL. Returns null when there is no
 * screenshot; throws a plain Error with a user-safe message when the payload is
 * present but invalid, so the route can surface a 400/413.
 */
export function parseScreenshotDataUrl(input: unknown): ParsedScreenshot | null {
  if (typeof input !== 'string' || !input) return null;

  // Length first: cheap, allocation-free, and true of any encoding of an oversized image.
  // Note this changes the message for oversized NON-images from "must be a PNG, JPEG, or
  // WebP" to "too large". Both are rejections, and for a multi-megabyte payload the size is
  // the more useful complaint — but it is a deliberate behaviour change, not an accident.
  if (input.length > MAX_DATA_URL_CHARS) {
    const err = new Error('Screenshot is too large. Please attach a smaller image.');
    err.name = 'ScreenshotTooLarge';
    throw err;
  }

  const match = DATA_URL_RE.exec(input);
  if (!match) {
    throw new Error('Screenshot must be a PNG, JPEG, or WebP image.');
  }

  const mime = `image/${match[1] === 'jpg' ? 'jpeg' : match[1]}`;
  const buffer = Buffer.from(match[2], 'base64');

  if (buffer.byteLength === 0) {
    throw new Error('Screenshot could not be read. Please attach a different image.');
  }
  if (buffer.byteLength > MAX_DECODED_BYTES) {
    const err = new Error('Screenshot is too large. Please attach a smaller image.');
    err.name = 'ScreenshotTooLarge';
    throw err;
  }

  return {
    buffer,
    contentType: mime,
    ext: EXT_BY_MIME[mime] || 'png',
  };
}

/**
 * Upload a decoded screenshot to Cloud Storage and return a stable, tokenized
 * public URL. Mirrors the lightweight branding-logo upload pattern (direct
 * file.save with a firebaseStorageDownloadTokens token) rather than the heavy
 * StorageService path, which would create a managed Document record and run a
 * virus scan the ticket flow does not need.
 */
export async function uploadTicketScreenshot(params: {
  tenantId: string;
  ticketId: string;
  screenshot: ParsedScreenshot;
}): Promise<{ url: string; storagePath: string }> {
  const { tenantId, ticketId, screenshot } = params;

  const token = crypto.randomUUID();
  const storagePath = `tenants/${tenantId}/support/${ticketId}.${screenshot.ext}`;

  const bucketName = getStorageBucketName();
  const bucket = bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket();
  const file = bucket.file(storagePath);

  await file.save(screenshot.buffer, {
    contentType: screenshot.contentType,
    resumable: false,
    metadata: {
      cacheControl: 'private,max-age=3600',
      metadata: {
        tenantId,
        ticketId,
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const encodedPath = encodeURIComponent(storagePath);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;

  return { url, storagePath };
}

/**
 * Deterministic content hash used to collapse duplicate submissions. A user
 * mashing the submit button, or an automated flood, produces identical
 * (tenant, reporter, title, description) tuples; hashing them lets the write
 * path link a repeat to the original instead of creating N tickets.
 */
export function ticketContentHash(params: {
  tenantId: string;
  reporterUid: string;
  title: string;
  description: string;
}): string {
  return crypto
    .createHash('sha256')
    .update(
      [
        params.tenantId,
        params.reporterUid,
        params.title.trim().toLowerCase(),
        params.description.trim().toLowerCase(),
      ].join('\u0000'),
    )
    .digest('hex');
}
