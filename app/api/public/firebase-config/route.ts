import { NextResponse } from 'next/server';
import { isFirebaseEmulatorMode } from '@/lib/config/firebase-environment';

export const dynamic = 'force-dynamic';

function loopbackEmulatorHost(value: string | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(`http://${raw}`);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) return null;
    if (!parsed.port) return null;
    return `${parsed.hostname}:${parsed.port}`;
  } catch {
    return null;
  }
}

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

  const emulatorMode = isFirebaseEmulatorMode(process.env);
  const authEmulatorHost = emulatorMode
    ? loopbackEmulatorHost(process.env.FIREBASE_AUTH_EMULATOR_HOST)
    : null;
  const firestoreEmulatorHost = emulatorMode
    ? loopbackEmulatorHost(process.env.FIRESTORE_EMULATOR_HOST)
    : null;
  const storageEmulatorHost = emulatorMode
    ? loopbackEmulatorHost(process.env.FIREBASE_STORAGE_EMULATOR_HOST)
    : null;
  if (emulatorMode && (!authEmulatorHost || !firestoreEmulatorHost)) {
    return NextResponse.json(
      { error: 'Firebase browser emulator endpoints must be loopback host:port values.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      apiKey: NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: NEXT_PUBLIC_FIREBASE_APP_ID,
      ...(emulatorMode
        ? {
            emulators: {
              authHost: authEmulatorHost,
              firestoreHost: firestoreEmulatorHost,
              ...(storageEmulatorHost ? { storageHost: storageEmulatorHost } : {}),
            },
          }
        : {}),
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
