import { POST as updateUser } from '../../update/route';

/**
 * Backwards-compatible path adapter.
 *
 * The application has one canonical admin user-update implementation at
 * `/api/admin/users/update`. Keeping a second copy here previously let email changes,
 * role validation, manager validation, Auth claim synchronization and audit behavior
 * drift apart. Preserve the legacy URL for callers, but inject the path uid into the
 * canonical payload and execute exactly the same policy.
 */
export async function POST(req: Request, { params }: { params: { uid: string } }) {
  const body = await req.json().catch(() => ({}));
  const headers = new Headers(req.headers);
  headers.set('content-type', 'application/json');

  const canonicalRequest = new Request(req.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, uid: params.uid }),
  });

  return updateUser(canonicalRequest);
}
