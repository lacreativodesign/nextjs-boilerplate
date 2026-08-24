import { authorizeCronRequest } from '@/lib/cron/auth';

const request = (authorization?: string) => ({
  headers: new Headers(authorization ? { authorization } : {}),
});
const secret = 'a'.repeat(32);

describe('cron request authentication', () => {
  it('accepts only the configured bearer secret', () => {
    expect(authorizeCronRequest(request(`Bearer ${secret}`), secret)).toEqual({
      ok: true,
    });
    expect(authorizeCronRequest(request('Bearer wrong'), secret)).toEqual({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('fails as a configuration error when the secret is absent or a placeholder', () => {
    expect(authorizeCronRequest(request(), undefined)).toMatchObject({
      ok: false,
      status: 500,
    });
    expect(
      authorizeCronRequest(request('Bearer change-me-in-production'), 'change-me-in-production'),
    ).toMatchObject({ ok: false, status: 500 });
    expect(authorizeCronRequest(request('Bearer too-short'), 'too-short')).toMatchObject({
      ok: false,
      status: 500,
    });
  });

  it('never treats x-vercel-cron metadata as authorization', () => {
    const metadataOnly = {
      headers: new Headers({ 'x-vercel-cron': '1' }),
    };
    expect(authorizeCronRequest(metadataOnly, secret)).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});
