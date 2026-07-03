export function jsonRequest(url: string, body?: unknown, init: RequestInit = {}) {
  return new Request(url, {
    method: init.method || (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
    ...init,
  });
}
