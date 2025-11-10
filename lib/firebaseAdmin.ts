import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) privateKey = privateKey.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Missing Firebase Admin ENV variables", {
    projectId,
    clientEmail,
    hasPrivateKey: !!privateKey,
  });
}

const credentials = {
  project_id: projectId,
  client_email: clientEmail,
  private_key: privateKey,
};

export const adminApp =
  getApps().length === 0
    ? initializeApp({ credential: cert(credentials) })
    : getApps()[0];

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
