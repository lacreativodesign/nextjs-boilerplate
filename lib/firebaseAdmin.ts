import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Load environment variables
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

// Fix private key newlines for Vercel
if (privateKey) {
  privateKey = privateKey.replace(/\\n/g, "\n");
}

// Validate
if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Missing Firebase Admin ENV variables", {
    projectId,
    clientEmail,
    hasPrivateKey: !!privateKey,
  });
}

// Prepare credentials
const credentials = {
  project_id: projectId,
  client_email: clientEmail,
  private_key: privateKey,
};

// Initialize only once
export const adminApp =
  getApps().length === 0
    ? initializeApp({ credential: cert(credentials) })
    : getApps()[0];

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
