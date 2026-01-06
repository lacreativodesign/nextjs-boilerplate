import crypto from "crypto";
import admin from "firebase-admin";

type SeedUser = {
  email: string;
  role: string;
  name: string;
};

const SEED_USERS: SeedUser[] = [
  { email: "admin@lacreativo.com", role: "super_admin", name: "LA Creativo Super Admin" },
  { email: "info@lacreativo.com", role: "admin", name: "LA Creativo Admin" },
  { email: "sales@lacreativo.com", role: "sales", name: "LA Creativo Sales" },
  { email: "support@lacreativo.com", role: "account_manager", name: "LA Creativo Account Manager" },
  { email: "production@lacreativo.com", role: "production", name: "LA Creativo Production" },
  { email: "finance@lacreativo.com", role: "finance", name: "LA Creativo Finance" },
  { email: "hr@lacreativo.com", role: "hr", name: "LA Creativo HR" },
  { email: "client@lacreativo.com", role: "client", name: "LA Creativo Client" },
  { email: "sales_manager@lacreativo.com", role: "sales_manager", name: "LA Creativo Sales Manager" },
  { email: "am_manager@lacreativo.com", role: "am_manager", name: "LA Creativo AM Manager" },
  { email: "production_manager@lacreativo.com", role: "production_manager", name: "LA Creativo Production Manager" },
];

function parseServiceAccount() {
  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (!raw) {
    throw new Error("Missing FIREBASE_ADMIN_KEY. Provide a full service account JSON.");
  }
  return JSON.parse(raw);
}

function getTenantId() {
  return process.env.DEFAULT_TENANT_ID || "default";
}

async function initAdmin() {
  if (!admin.apps.length) {
    const serviceAccount = parseServiceAccount();
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return {
    auth: admin.auth(),
    db: admin.firestore(),
  };
}

async function upsertUser(user: SeedUser, tenantId: string, auth: admin.auth.Auth, db: admin.firestore.Firestore) {
  let uid = "";
  let createdAuthUser = false;

  try {
    const existing = await auth.getUserByEmail(user.email);
    uid = existing.uid;
  } catch (err) {
    try {
      const created = await auth.createUser({
        email: user.email,
        password: crypto.randomBytes(16).toString("hex"),
        displayName: user.name,
      });
      uid = created.uid;
      createdAuthUser = true;
    } catch (createErr) {
      uid = `seed_${Buffer.from(user.email).toString("hex")}`;
      console.warn(
        `Auth user could not be created for ${user.email}. Seeding Firestore only with placeholder uid: ${uid}`
      );
    }
  }

  await db.collection("users").doc(uid).set(
    {
      uid,
      name: user.name,
      email: user.email,
      role: user.role,
      status: "active",
      tenantId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      seededAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`Seeded ${user.email} (${user.role})${createdAuthUser ? " [auth created]" : ""}`);
}

async function run() {
  const { auth, db } = await initAdmin();
  const tenantId = getTenantId();

  for (const user of SEED_USERS) {
    await upsertUser(user, tenantId, auth, db);
  }

  console.log("Seed users completed.");
}

run().catch((err) => {
  console.error("Seed users failed:", err);
  process.exit(1);
});
