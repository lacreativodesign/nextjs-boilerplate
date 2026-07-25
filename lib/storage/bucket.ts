/**
 * Resolves the Cloud Storage bucket name for every server-side storage operation.
 *
 * Before this helper, ten call sites (uploads, downloads, imports, exports, DocuSign,
 * managed files) each inlined the same chain:
 *
 *   process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FB_STORAGE || undefined
 *
 * `NEXT_PUBLIC_FB_STORAGE` is not set anywhere — the real public var is
 * `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`. So whenever the server var was unset, every one of
 * those sites silently fell through to the Admin SDK default bucket instead of the configured
 * one, and a typo in the legacy name could never be caught because nothing referenced it.
 *
 * This is the single resolver. It prefers the explicit server var, then the public Firebase
 * bucket (which is always configured for the client), then `undefined` so the caller uses the
 * Admin SDK default. It deliberately does NOT fall back to a hardcoded bucket.
 */
export function getStorageBucketName(): string | undefined {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    undefined
  );
}
