import { parseScreenshotDataUrl, ticketContentHash } from '@/lib/support/storage';

/**
 * Unit coverage for the ticket screenshot/dedup helpers.
 *
 * These are the validation and deduplication primitives on the bug-report write
 * path. The screenshot parser is a defensive boundary (it decides what bytes are
 * allowed to reach Cloud Storage), and the content hash is what collapses
 * duplicate submissions, so both are pinned here against regression.
 */

// A 1x1 transparent PNG, base64. Small, valid, decodes to a non-empty buffer.
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('parseScreenshotDataUrl', () => {
  it('returns null when there is no screenshot', () => {
    expect(parseScreenshotDataUrl(null)).toBeNull();
    expect(parseScreenshotDataUrl(undefined)).toBeNull();
    expect(parseScreenshotDataUrl('')).toBeNull();
  });

  it('accepts a valid PNG data URL and decodes it', () => {
    const parsed = parseScreenshotDataUrl(`data:image/png;base64,${PNG_1x1}`);
    expect(parsed).not.toBeNull();
    expect(parsed!.contentType).toBe('image/png');
    expect(parsed!.ext).toBe('png');
    expect(parsed!.buffer.byteLength).toBeGreaterThan(0);
  });

  it('normalizes a jpg data URL to image/jpeg with a jpg extension', () => {
    const parsed = parseScreenshotDataUrl(`data:image/jpg;base64,${PNG_1x1}`);
    expect(parsed!.contentType).toBe('image/jpeg');
    expect(parsed!.ext).toBe('jpg');
  });

  it('rejects a non-image or malformed data URL', () => {
    expect(() => parseScreenshotDataUrl('data:text/html;base64,PHNjcmlwdD4=')).toThrow(
      /PNG, JPEG, or WebP/i,
    );
    expect(() => parseScreenshotDataUrl('not-a-data-url')).toThrow(/PNG, JPEG, or WebP/i);
  });

  it('rejects an oversized payload on length, before decoding it', () => {
    // The ceiling is enforced on the data-URL string itself, so nothing multi-megabyte is
    // ever allocated. That is what makes the rejection independent of how much memory the
    // process happens to have: a CI runner once failed this very assertion with `RangeError`
    // because the allocation lost before the size check could run.
    const overLimit = 'data:image/png;base64,' + 'A'.repeat(5 * 1024 * 1024);
    const started = Date.now();
    expect(() => parseScreenshotDataUrl(overLimit)).toThrow(/too large/i);
    // Rejecting on length is O(1); decoding first was ~4MB of work. Generous bound — the
    // point is that it cannot be doing the expensive path.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('rejects an oversized NON-image on size rather than on format', () => {
    // Deliberate behaviour change: the length guard runs before the format check, so a huge
    // payload is "too large" even when it is not an image at all. Pinned so the ordering is
    // not silently reversed back.
    let caught: unknown;
    try {
      parseScreenshotDataUrl('x'.repeat(5 * 1024 * 1024));
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).name).toBe('ScreenshotTooLarge');
  });

  it('still accepts a payload just under the ceiling', () => {
    // The guard must not reject legitimate images. A 2MB decoded PNG is well inside 3MB.
    const body = 'A'.repeat(Math.floor((2 * 1024 * 1024) / 3) * 4);
    expect(() => parseScreenshotDataUrl(`data:image/png;base64,${body}`)).not.toThrow();
  });

  it('rejects an oversized payload with a ScreenshotTooLarge error', () => {
    // ~5MB of base64 -> decodes to ~3.75MB, clearly above the 3MB ceiling.
    const huge = 'A'.repeat(5 * 1024 * 1024);
    let caught: unknown;
    try {
      parseScreenshotDataUrl(`data:image/png;base64,${huge}`);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('ScreenshotTooLarge');
  });
});

describe('ticketContentHash', () => {
  const base = {
    tenantId: 'acme',
    reporterUid: 'user_1',
    title: 'Button broken',
    description: 'The save button does nothing.',
  };

  it('is deterministic for identical input', () => {
    expect(ticketContentHash(base)).toBe(ticketContentHash({ ...base }));
  });

  it('ignores case and surrounding whitespace in title and description', () => {
    const noisy = {
      ...base,
      title: '  BUTTON BROKEN  ',
      description: '  The Save Button Does Nothing.  ',
    };
    expect(ticketContentHash(noisy)).toBe(ticketContentHash(base));
  });

  it('differs across tenants for otherwise identical content', () => {
    expect(ticketContentHash({ ...base, tenantId: 'other' })).not.toBe(ticketContentHash(base));
  });

  it('differs across reporters for otherwise identical content', () => {
    expect(ticketContentHash({ ...base, reporterUid: 'user_2' })).not.toBe(ticketContentHash(base));
  });

  it('differs when the description changes', () => {
    expect(ticketContentHash({ ...base, description: 'Different problem entirely.' })).not.toBe(
      ticketContentHash(base),
    );
  });
});
