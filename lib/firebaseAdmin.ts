import * as admin from "firebase-admin";

// Prevent re-initializing during hot reload or multiple imports
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// EXPORT CLEAN DIRECT ACCESS
export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
