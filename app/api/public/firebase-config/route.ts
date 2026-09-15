import { NextResponse } from 'next/server';
import {
  describeFirebaseEnvironmentViolations,
  evaluateFirebaseEnvironment,
} from '@/lib/firebase/environment.mjs';

/**
 * The browser's only source of Firebase configuration (see lib/firebaseClient.ts), which
 * makes it the last place a deployment can refuse to point a write-capable browser at the
 * wrong Firebase project.
 *
 * P0-01: this route used to return whatever `NEXT_PUBLIC_FIREBASE_*` held, so the PR #1008
 * Vercel Preview handed every browser the PRODUCTION project and bucket — byte-identical
 * to app.bizosto.com. A Preview that cannot satisfy the isolation contract now serves no
 * Firebase configuration at all, so there is no client to write with.
 *
 * WHY IT IS DYNAMIC NOW
 *
 * It was `revalidate = 86400`, which made Next prerender it: the live production response
 * carried `x-vercel-cache: PRERENDER`. A prerender evaluates at BUILD time, and the
 * isolation verdict depends on `FIREBASE_ADMIN_KEY` — a runtime server secret that a bare
 * `npm run build` does not have. Freezing a verdict computed without it into the deployed
 * artefact would mean the boundary was decided by the build rather than by the runtime it
 * protects. The response is still CDN-cacheable through the `/api/public/:path*`
 * Cache-Control in next.config.js, so this costs one function invocation per cache fill,
 * not one per login.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const {
    NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID,
  } = process.env;

  const missing = [
    ['NEXT_PUBLIC_FIREBASE_API_KEY', NEXT_PUBLIC_FIREBASE_API_KEY],
    ['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN],
    ['NEXT_PUBLIC_FIREBASE_PROJECT_ID', NEXT_PUBLIC_FIREBASE_PROJECT_ID],
    ['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET],
    ['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID],
    ['NEXT_PUBLIC_FIREBASE_APP_ID', NEXT_PUBLIC_FIREBASE_APP_ID],
  ].filter(([, value]) => !value);

  if (missing.length) {
    return NextResponse.json(
      {
        error: `Firebase public config is incomplete: ${missing.map(([key]) => key).join(', ')}.`,
      },
      { status: 500 },
    );
  }

  // Deliberately does NOT consult `isNonRuntimePhase`. A phase that is serving an HTTP
  // request is a runtime by definition, and `next build` serves none — so reading
  // NEXT_PHASE here would turn an ordinary settable variable into a way for a deployed
  // Preview to present itself as a harmless build.
  const isolation = describeFirebaseEnvironmentViolations(evaluateFirebaseEnvironment());
  if (isolation) {
    console.error(isolation);
    return NextResponse.json(
      {
        // The diagnostic names Firebase project ids and bucket names only. Both are public
        // identifiers, and the operator who has to fix this reads it from the deployment.
        error: isolation,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    apiKey: NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}
