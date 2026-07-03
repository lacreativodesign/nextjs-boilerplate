import { NextRequest, NextResponse } from 'next/server';

export const CURRENT_API_VERSION = 'v1';
export const NEXT_API_VERSION = 'v2';

const DEPRECATION_NOTICE_MONTHS = 6;
const DEPRECATION_HEADER_NAME = 'X-API-Deprecated';

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function getApiVersion(pathname: string): 'v1' | 'v2' | 'unversioned' {
  if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) {
    return 'v1';
  }
  if (pathname === '/api/v2' || pathname.startsWith('/api/v2/')) {
    return 'v2';
  }
  return 'unversioned';
}

export function getDeprecationHeaders(requestDate = new Date()) {
  const sunset = addMonths(requestDate, DEPRECATION_NOTICE_MONTHS);
  return {
    [DEPRECATION_HEADER_NAME]: 'true',
    Deprecation: 'true',
    Sunset: sunset.toUTCString(),
    Link: '</docs/api-changelog#unversioned-api-deprecation>; rel="deprecation"; type="text/html"',
  };
}

export function applyVersionHeaders(response: NextResponse, pathname: string) {
  if (!pathname.startsWith('/api')) {
    return response;
  }

  const version = getApiVersion(pathname);

  if (version === 'unversioned') {
    const headers = getDeprecationHeaders();
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    response.headers.set('X-API-Version', CURRENT_API_VERSION);
    response.headers.set('X-API-Version-Alias', 'true');
    return response;
  }

  response.headers.set('X-API-Version', version);
  response.headers.set('X-API-Version-Alias', 'false');
  return response;
}

export async function proxyVersionedRequest(
  request: NextRequest,
  targetPathname: string,
): Promise<NextResponse> {
  const headers = new Headers(request.headers);
  headers.delete('host');

  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();

  const upstreamResponse = await fetch(
    new URL(targetPathname + request.nextUrl.search, request.url),
    {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
    },
  );

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('content-encoding');

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
