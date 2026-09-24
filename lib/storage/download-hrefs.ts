/**
 * P0-07 — same-origin download links for protected tenant files.
 *
 * These are Bizosto routes, not storage URLs: following one re-authenticates the session,
 * re-checks tenant, role and resource ACL, and only then redirects to a signed URL that
 * expires in minutes. They carry no credential, so they are safe to put in a list
 * response, a notification or an `<a href>`, and they never go stale — which is exactly
 * what the persisted Firebase `downloadUrl` they replace was not.
 *
 * Pure string builders with no server imports, so client components can use them too.
 */

const segment = (id: string) => encodeURIComponent(String(id ?? '').trim());

/** `files` collection records: project deliverables and client uploads. */
export function projectFileDownloadHref(fileId: string): string {
  return `/api/project-files/${segment(fileId)}/download`;
}

/** `employeeDocuments` records, from either HR document surface. */
export function hrDocumentDownloadHref(documentId: string): string {
  return `/api/hr/documents/${segment(documentId)}/download`;
}

/** Managed files (`erp_files`). `inline` asks for a preview rather than an attachment. */
export function managedFileDownloadHref(fileId: string, opts?: { inline?: boolean }): string {
  return `/api/files/${segment(fileId)}/download${opts?.inline ? '?disposition=inline' : ''}`;
}

/** Support-ticket screenshots; the route is super_admin-only. */
export function supportScreenshotHref(ticketId: string): string {
  return `/api/super_admin/tickets/${segment(ticketId)}/screenshot`;
}
