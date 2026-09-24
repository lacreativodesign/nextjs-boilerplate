/**
 * P0-07 — the deliberate PUBLIC exception: tenant logos.
 *
 * A tenant logo is public-facing on purpose. It is shown on the public invoice payment
 * page to people with no Bizosto account, embedded in invoice PDFs and rendered in every
 * signed-in surface. So it is NOT treated like an HR file: there is no session check on
 * reading it, and there is not meant to be.
 *
 * What changed is HOW it is public. It used to be stored with a
 * `firebaseStorageDownloadTokens` token and published as a tokenized Firebase URL. That
 * token is a generic bearer credential for the object — it would stay valid if the object
 * were ever replaced by something that is not a logo, it cannot be scoped, rotated or
 * rate-limited by Bizosto, and it trains every surface to accept tokenized Firebase URLs
 * as normal. Now:
 *
 *   - the object carries no download token (Admin-SDK write, see uploadTenantLogo);
 *   - the tenant document stores the object's canonical `logoStoragePath`;
 *   - the logo is served by /api/public/branding/{tenantId}/logo, which reads ONLY the
 *     object at that tenant's recorded logo path, only if it is an allow-listed image type
 *     under the tenant's branding prefix, with nosniff and a sandboxing CSP.
 *
 * The endpoint path is what `logoUrl` persists. It carries no credential, never expires
 * and cannot be used to read anything but that tenant's logo.
 *
 * Pure module (no server imports) so client code and validators can share it.
 */

const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export const PUBLIC_LOGO_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export function isSafeTenantId(tenantId: string): boolean {
  return TENANT_ID_RE.test(String(tenantId ?? ''));
}

/** The stable public URL of a tenant's logo. `version` busts caches after a replacement. */
export function publicLogoHref(tenantId: string, version?: string | number | null): string {
  const v = String(version ?? '').trim();
  const query = /^\d{1,32}$/.test(v) ? `?v=${v}` : '';
  return `/api/public/branding/${encodeURIComponent(tenantId)}/logo${query}`;
}

/** True for this tenant's own logo endpoint, with or without a version. */
export function isOwnPublicLogoHref(value: string, tenantId: string): boolean {
  if (!isSafeTenantId(tenantId)) return false;
  const prefix = `/api/public/branding/${tenantId}/logo`;
  return value === prefix || new RegExp(`^${prefix}\\?v=\\d{1,32}$`).test(value);
}

/**
 * The objects a tenant logo may live in:
 *   tenants/{t}/branding/logo.{png|jpg|webp|svg}   server upload (uploadTenantLogo)
 *   tenants/{t}/brand/logo.webp                    legacy super_admin browser upload
 * Nothing else is ever served by the public endpoint.
 */
export function isPublicLogoPath(storagePath: string, tenantId: string): boolean {
  if (!isSafeTenantId(tenantId)) return false;
  const path = String(storagePath ?? '');
  if (path === `tenants/${tenantId}/brand/logo.webp`) return true;
  return Object.keys(PUBLIC_LOGO_CONTENT_TYPES).some(
    (ext) => path === `tenants/${tenantId}/branding/logo.${ext}`,
  );
}

/** True for any Firebase Storage URL that carries a download token. */
export function isFirebaseTokenUrl(value: string): boolean {
  try {
    const url = new URL(String(value ?? ''));
    return url.hostname === 'firebasestorage.googleapis.com' && url.searchParams.has('token');
  } catch {
    return false;
  }
}

/**
 * Recovers the object path from a legacy tokenized logo URL, so the public endpoint can
 * keep serving a logo whose tenant document predates `logoStoragePath`. The token is
 * discarded. Returns null unless the path is one of this tenant's logo objects.
 */
export function logoPathFromLegacyUrl(value: unknown, tenantId: string): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'firebasestorage.googleapis.com') {
      return null;
    }
    const match = /^\/v0\/b\/[^/]+\/o\/([^/]+)$/.exec(url.pathname);
    if (!match) return null;
    const path = decodeURIComponent(match[1]);
    return isPublicLogoPath(path, tenantId) ? path : null;
  } catch {
    return null;
  }
}

export class UnsupportedLogoUrlError extends Error {
  constructor(message = 'Unsupported logo URL.') {
    super(message);
    this.name = 'UnsupportedLogoUrlError';
  }
}

/**
 * Normalises a logo URL a caller wants to persist.
 *
 *   null/empty                          -> null (no logo)
 *   this tenant's /api/public/... href  -> kept
 *   legacy tokenized Firebase URL for
 *     one of THIS tenant's logo objects -> migrated to the public href; token dropped
 *   any other tokenized Firebase URL    -> refused: a bearer URL is never stored again
 *   another absolute https URL          -> kept (an externally hosted logo)
 *   anything else (http:, data:,
 *     javascript:, relative paths)      -> refused
 */
export function normalizeLogoUrl(
  value: unknown,
  tenantId: string,
): { logoUrl: string | null; logoStoragePath?: string } {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { logoUrl: null };

  if (isOwnPublicLogoHref(raw, tenantId)) return { logoUrl: raw };

  if (isFirebaseTokenUrl(raw)) {
    const recovered = logoPathFromLegacyUrl(raw, tenantId);
    if (!recovered) {
      throw new UnsupportedLogoUrlError(
        'Firebase download URLs are not accepted as logo URLs. Upload the logo instead.',
      );
    }
    return { logoUrl: publicLogoHref(tenantId), logoStoragePath: recovered };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UnsupportedLogoUrlError();
  }
  if (parsed.protocol !== 'https:' || raw.length > 2048) throw new UnsupportedLogoUrlError();
  return { logoUrl: raw };
}

/** Absolute form of a logo URL for renderers with no page origin (react-pdf). */
export function absoluteLogoUrl(logoUrl: string | null | undefined, origin: string) {
  const value = String(logoUrl ?? '').trim();
  if (!value) return null;
  if (value.startsWith('/api/public/branding/')) {
    try {
      return new URL(value, origin).toString();
    } catch {
      return null;
    }
  }
  return value;
}
