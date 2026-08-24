import fs from 'fs';
import path from 'path';
import { GET } from '@/app/api/public/firebase-config/route';

const originalEnv = { ...process.env };
const requiredPublicConfig = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-bizosto.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-bizosto',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-bizosto.appspot.com',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1',
  NEXT_PUBLIC_FIREBASE_APP_ID: 'demo-app',
};

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

describe('Firebase browser emulator binding', () => {
  it('exposes loopback endpoints only for a safe demo-project emulator environment', async () => {
    Object.assign(process.env, requiredPublicConfig, {
      NODE_ENV: 'development',
      BIZOSTO_ENVIRONMENT: 'development',
      FIREBASE_EXPECTED_PROJECT_ID: 'demo-bizosto',
      FIREBASE_PRODUCTION_PROJECT_ID: 'prod-bizosto',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    });

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      projectId: 'demo-bizosto',
      emulators: {
        authHost: '127.0.0.1:9099',
        firestoreHost: '127.0.0.1:8080',
        storageHost: '127.0.0.1:9199',
      },
    });
  });

  it('never exposes emulator endpoints for production', async () => {
    Object.assign(process.env, requiredPublicConfig, {
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      BIZOSTO_ENVIRONMENT: 'production',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'prod-bizosto',
      FIREBASE_EXPECTED_PROJECT_ID: 'prod-bizosto',
      FIREBASE_PRODUCTION_PROJECT_ID: 'prod-bizosto',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    });

    const response = await GET();
    const body = await response.json();
    expect(body.emulators).toBeUndefined();
  });

  it('wires every browser Firebase service before it can be used', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'lib/firebaseClient.ts'), 'utf8');
    expect(source).toContain('connectAuthEmulator(');
    expect(source).toContain('connectFirestoreEmulator(');
    expect(source).toContain('connectStorageEmulator(');
    expect(source).toContain('__bizostoFirebaseEmulatorsConnected');
  });
});
