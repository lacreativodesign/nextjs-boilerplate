import { NextResponse } from 'next/server';
import { DemoCredentialConfigurationError, DemoMutationBlockedError } from '@/lib/demo/safety';

export function demoRouteErrorResponse(error: unknown, fallback: string) {
  if (error instanceof DemoMutationBlockedError) {
    console.warn('Demo mutation denied', { reason: error.reason });
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: 403 },
    );
  }

  if (error instanceof DemoCredentialConfigurationError) {
    console.error('Demo credential configuration is invalid');
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: 503 },
    );
  }

  const message = error instanceof Error ? error.message : '';
  if (message === 'Unauthorized') {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (message === 'Forbidden') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  console.error(fallback, error);
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
}
