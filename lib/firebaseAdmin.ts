// lib/firebaseAdmin.ts
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let adminApp: App | undefined;

/**
 * Singleton Firebase Admin app – uses your Vercel env vars:
 * FIREBASE_PROJECT_ID
 * FIREBASE_CLIENT_EMAIL
 * FIREBASE_PRIVATE_KEY
 */
export function getAdminApp(): App {
  if (!adminApp) {
    adminApp = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process
          .env
          .FIREBASE_PRIVATE_KEY
          ?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return adminApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDB() {
  return getFirestore(getAdminApp());
}
