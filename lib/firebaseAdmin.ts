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
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(
          /\\n/g,
          "\n"
        ),
      }),
    });
  } else {
    adminApp = getApp();
  }

  return adminApp!;
}

/** MAIN named exports you should use going forward */
export function adminAuth() {
  return getAuth(getAdminApp());
}

export function adminDb() {
  return getFirestore(getAdminApp());
}

/** Aliases so ANY old import style keeps working */
export const adminDB = adminDb;        // for `import { adminDB } ...`
export const getAdminAuth = adminAuth; // for `import { getAdminAuth } ...`
export const getAdminDB = adminDb;     // for `import { getAdminDB } ...`
