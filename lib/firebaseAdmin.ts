// lib/firebaseAdmin.ts
import { cert, getApps, initializeApp, App, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let adminApp: App | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;

  if (!getApps().length) {
    adminApp = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  } else {
    adminApp = getApp();
  }

  return adminApp!;
}

/** Server-side Auth (firebase-admin) */
export function adminAuth() {
  return getAuth(getAdminApp());
}

/** Server-side Firestore (firebase-admin) */
export function adminDb() {
  return getFirestore(getAdminApp());
}

/** Backward-compat aliases so older imports don't break */
export const getAdminAuth = adminAuth;
export const getAdminDB = adminDb;
