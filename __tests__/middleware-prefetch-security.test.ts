import fs from 'node:fs';
import path from 'node:path';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { middleware } from '../middleware';

function cookieJar(values: Record<string, string> = {}) {
  return {
    get(name: string) {
      const value = values[name];
      return value === undefined ? undefined : { name, value };
    },
  };
}

function requestFor(
  pathname: string,
  options: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    method?: string;
  } = {},
): NextRequest {
  const url = new URL(pathname, 'https://app.bizosto.com');
  const headers = new Headers(options.headers);

  if (options.cookies && Object.keys(options.cookies).length > 0) {
    headers.set(
      'cookie',
      Object.entries(options.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; '),
    );
  }

  return {
    url: url.toString(),
    method: options.method ?? 'GET',
    headers,
    cookies: cookieJar(options.cookies),
    nextUrl: {
      href: url.toString(),
      pathname: url.pathname,
      clone: () => new URL(url.toString()),
    },
  } as unknown as NextRequest;
}

function eventFor(): NextFetchEvent {
  return {
    waitUntil: jest.fn(),
  } as unknown as NextFetchEvent;
}

function subscriptionResponse(state: string, role = 'admin') {
  return new Response(JSON.stringify({ ok: true, subscriptionState: state, role }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('middleware prefetch security boundary', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('does not let a caller-controlled prefetch header bypass authentication', async () => {
    const response = await middleware(
      requestFor('/admin/clients', {
        headers: { 'x-middleware-prefetch': '1' },
      }),
      eventFor(),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.bizosto.com/login');
    expect(response.headers.get('x-frame-options')).toBeTruthy();
  });

  it('allows an authenticated active-role prefetch through the normal middleware path', async () => {
    global.fetch = jest.fn().mockResolvedValue(subscriptionResponse('active')) as typeof fetch;

    const response = await middleware(
      requestFor('/admin/clients', {
        headers: { 'x-middleware-prefetch': '1' },
        cookies: { lac_session: 'session-token' },
      }),
      eventFor(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('still applies the subscription hard lock to authenticated prefetches', async () => {
    global.fetch = jest.fn().mockResolvedValue(subscriptionResponse('pending_checkout')) as typeof fetch;

    const response = await middleware(
      requestFor('/admin/clients', {
        headers: { 'x-middleware-prefetch': '1' },
        cookies: { lac_session: 'session-token' },
      }),
      eventFor(),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.bizosto.com/billing');
  });

  it('pins the source against reintroducing an early x-middleware-prefetch bypass', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf8');
    expect(source).not.toContain("req.headers.get('x-middleware-prefetch')");
    expect(source).not.toContain('x-middleware-prefetch');
  });
});
