import { NextResponse } from 'next/server';
import { firebaseEnvironmentReport } from '@/lib/firebase/environment.mjs';

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
    // P0-01 certification identity. The same reasoning as `commit`, for the other thing
    // certification must name and used to assume: WHICH FIREBASE ENVIRONMENT this
    // deployment is wired to. Without it, CI could only take a Preview's word that it was
    // not production — and on main (da41e8d) that word would have been wrong.
    //
    // Everything here is a public identifier: `VERCEL_ENV`, Firebase project ids and
    // bucket names, all of which the browser config already carries when the deployment is
    // correctly wired. `FIREBASE_ADMIN_KEY` is read for its `project_id` field alone and
    // is never exposed, in whole or in part.
    //
    // Liveness stays liveness: this is a pure, synchronous read of process.env with no
    // dependency call and no I/O, and the probe still answers 200 `ok` whatever the
    // verdict. Enforcement is the boot gate, the Admin SDK bootstrap and
    // /api/public/firebase-config; this endpoint only states the facts CI needs.
    ...firebaseEnvironmentReport(),
  });
}
