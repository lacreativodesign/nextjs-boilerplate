import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'production',
    version: process.env.npm_package_version ?? '1.0.0',
    // Which commit this instance was built from. Certification has to state that the
    // suite ran against the exact SHA being certified, and `E2E_BASE_URL` can legitimately
    // be a branch alias that silently re-points at whatever deployed last — so the
    // deployment has to be able to say, rather than be assumed. Null off Vercel.
    // Not sensitive: the repository is public and the SHA is already in every URL Vercel
    // builds from it.
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
