/**
 * P0-07 — fields that legacy records used to hold AUTHORIZATION in.
 *
 *   downloadUrl  Firebase URL with a permanent download token (files, employeeDocuments)
 *   storageUrl   7-day V2 signed URL written at upload (documents)
 *   previewUrl   2-day / 7-day signed URL written at upload (erp_files, versions, documents)
 *
 * A signed URL or a tokenized URL is a credential, not an identity: storing one and
 * handing it to every later reader turns "was allowed to see this at upload time" into
 * "may read these bytes until the URL expires", for whoever the record reaches. New
 * writes no longer create these fields with a value; this strips whatever older records
 * still carry before a record leaves the server. Downloads and previews are minted per
 * request by an authorized route instead (lib/storage/protected-download.ts).
 */
export const STORED_URL_FIELDS = ['downloadUrl', 'storageUrl', 'previewUrl'] as const;

type StoredUrlFields = { [K in (typeof STORED_URL_FIELDS)[number]]?: unknown };

export function withoutStoredUrls<T extends object>(record: T): Omit<T, keyof StoredUrlFields> {
  const copy = { ...(record as Record<string, unknown>) };
  for (const field of STORED_URL_FIELDS) delete copy[field];
  return copy as Omit<T, keyof StoredUrlFields>;
}
