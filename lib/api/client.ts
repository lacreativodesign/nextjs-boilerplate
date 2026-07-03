const CSRF_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' } as const;

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = RequestInit & { headers?: Record<string, string> };

/**
 * Drop-in fetch wrapper for internal /api/* calls.
 * Automatically attaches X-Requested-With for CSRF validation.
 */
export function apiFetch(input: FetchInput, init: FetchInit = {}): Promise<Response> {
  return fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      ...CSRF_HEADERS,
      ...init.headers,
    },
  });
}
