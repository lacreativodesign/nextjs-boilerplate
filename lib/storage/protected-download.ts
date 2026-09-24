import { NextResponse } from 'next/server';
import { isTenantStoragePath } from '@/lib/storage/paths';
import { productStorageBucket } from '@/lib/storage/product-bucket';

/**
 * P0-07 — the only way a protected tenant object leaves the bucket.
 *
 * A signed URL IS authorization: whoever holds it can read the object until it expires,
 * with no session, tenant or role check. So this module mints one only AFTER a route has
 * authorized the caller against the record, never persists it, and gives it a lifetime
 * sized for an interactive click — the browser follows the redirect immediately — rather
 * than for storage.
 *
 * Every protected download route (project files, HR documents, managed files, documents,
 * support screenshots) goes through mintProtectedDownloadUrl(). Records persist the
 * canonical `storagePath`; the URL is recomputed on every request, so an expired link is
 * fixed by clicking again, not by a migration.
 */

/**
 * Five minutes. Long enough for a redirect to be followed and a large file to START
 * downloading — Cloud Storage checks expiry when the request begins, not while bytes are
 * streaming — and short enough that a URL copied out of a browser's history is dead
 * before it is useful to anyone else.
 */
export const PROTECTED_DOWNLOAD_TTL_MS = 5 * 60 * 1000;

/** Hard ceiling any signed URL in this codebase may request. Pinned by tests. */
export const MAX_PROTECTED_DOWNLOAD_TTL_MS = 15 * 60 * 1000;

export type Disposition = 'attachment' | 'inline';

/** RFC 6266 / 5987 Content-Disposition with a name that cannot break the header. */
export function contentDisposition(fileName: string, disposition: Disposition): string {
  const clean = String(fileName || 'download')
    .replace(/[\r\n"\\]/g, '_')
    .trim()
    .slice(0, 180);
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_') || 'download';
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean || 'download')}`;
}

export class ProtectedDownloadRefused extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'ProtectedDownloadRefused';
    this.code = code;
    this.status = status;
  }
}

/**
 * Mints a short-lived V4 signed read URL for ONE tenant object.
 *
 * The caller must already have authorized the request against the record. This function
 * adds the object-level guarantee on top: the path has to sit inside the caller's own
 * tenant prefix. A legacy flat path (pre-S4) is refused rather than signed — the record
 * that names it cannot prove which tenant owns those bytes, which is the same reason
 * lib/storage/tenant-object.ts refuses to delete one.
 */
export async function mintProtectedDownloadUrl(params: {
  storagePath: string;
  tenantId: string;
  /**
   * The roots this record's object may live under (surfaceStorageRoot()). A record
   * written before P0-07 could name ANY object in the tenant — its storagePath was only
   * tenant-checked at registration — so the download re-proves the binding instead of
   * trusting it. Omit only for server-written records whose path the server chose.
   */
  allowedRoots?: Array<string | null>;
  fileName: string;
  disposition?: Disposition;
  contentType?: string;
  ttlMs?: number;
}): Promise<{ url: string; expiresAt: string }> {
  const storagePath = String(params.storagePath || '').trim();
  if (!storagePath) {
    throw new ProtectedDownloadRefused('no_object', 404, 'This file has no stored object.');
  }
  if (!isTenantStoragePath(storagePath, params.tenantId)) {
    throw new ProtectedDownloadRefused(
      'legacy_storage_path',
      409,
      'This file is stored under a legacy path that cannot be verified as belonging to your ' +
        'workspace, so it cannot be downloaded automatically. Contact support to migrate it.',
    );
  }

  if (params.allowedRoots) {
    const roots = params.allowedRoots.filter((root): root is string => Boolean(root));
    if (!roots.some((root) => storagePath.startsWith(root) && storagePath.length > root.length)) {
      throw new ProtectedDownloadRefused(
        'storage_path_mismatch',
        409,
        'This file record does not point at an object that belongs to it, so it cannot be ' +
          'downloaded. Contact support.',
      );
    }
  }

  const ttl = Math.min(
    Math.max(Number(params.ttlMs ?? PROTECTED_DOWNLOAD_TTL_MS), 1000),
    MAX_PROTECTED_DOWNLOAD_TTL_MS,
  );
  const expires = Date.now() + ttl;

  const [url] = await productStorageBucket()
    .file(storagePath)
    .getSignedUrl({
      version: 'v4',
      action: 'read',
      expires,
      responseDisposition: contentDisposition(params.fileName, params.disposition ?? 'attachment'),
      ...(params.contentType ? { responseType: params.contentType } : {}),
    });

  return { url, expiresAt: new Date(expires).toISOString() };
}

/** Headers every protected download response carries: never cache, never leak a referrer. */
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
} as const;

/**
 * Turns a minted URL into the route's response. A plain navigation (`<a href>`) gets a
 * 302 so the browser downloads immediately; `?format=json` returns the URL for callers
 * that need to place it in an <img>/<iframe>/<video> (previews) — still short-lived,
 * still never persisted.
 */
export function protectedDownloadResponse(
  request: Request,
  minted: { url: string; expiresAt: string },
): NextResponse {
  const format = new URL(request.url).searchParams.get('format');
  if (format === 'json') {
    return NextResponse.json(
      { ok: true, url: minted.url, downloadUrl: minted.url, expiresAt: minted.expiresAt },
      { headers: NO_STORE_HEADERS },
    );
  }
  const res = NextResponse.redirect(minted.url, 302);
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) res.headers.set(key, value);
  return res;
}

/** Maps a refusal (or an unexpected failure) to a response without leaking internals. */
export function protectedDownloadError(error: unknown, logLabel: string): NextResponse {
  if (error instanceof ProtectedDownloadRefused) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }
  console.error(`${logLabel} download error`, {
    name: (error as Error | null)?.name ?? 'Error',
  });
  return NextResponse.json(
    { ok: false, error: 'Unable to prepare this download right now.' },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

/** Shared JSON refusal for the authorization step, with the same no-store headers. */
export function downloadRefusal(status: number, error: string, code?: string): NextResponse {
  return NextResponse.json(
    { ok: false, error, ...(code ? { code } : {}) },
    { status, headers: NO_STORE_HEADERS },
  );
}
