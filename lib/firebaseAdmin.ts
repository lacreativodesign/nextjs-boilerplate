import * as admin from "firebase-admin";

let app: admin.app.App;

if (!admin.apps.length) {
  app = admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_ADMIN_KEY || "{}")
    ),
  });
} else {
  app = admin.app();
}

// Core services
const auth = admin.auth(app);
const db = admin.firestore(app);

// Export in all formats your API routes expect
export const adminAuth = auth;
export const adminDb = db;
export const adminDB = db; // Some routes use this
export const getAdminAuth = () => auth;
export const getAdminDB = () => db;

export default app;
