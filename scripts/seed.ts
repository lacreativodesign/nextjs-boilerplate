import * as admin from "firebase-admin";

const requiredEnv = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length) {
  console.warn(`[seed] Skipping seed: missing ${missing.join(", ")}`);
  process.exit(0);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const auth = admin.auth();
const db = admin.firestore();

const tenantId = process.env.SEED_TENANT_ID || "default";
const defaultPassword = process.env.SEED_PASSWORD || "ChangeMe123!";
const now = admin.firestore.FieldValue.serverTimestamp();

const roleSeeds = [
  { role: "super_admin", email: "qa-super_admin@lacreativo.test", name: "QA Super Admin" },
  { role: "admin", email: "qa-admin@lacreativo.test", name: "QA Admin" },
  { role: "sales_manager", email: "qa-sales-manager@lacreativo.test", name: "QA Sales Manager" },
  { role: "sales", email: "qa-sales@lacreativo.test", name: "QA Sales" },
  { role: "account_manager", email: "qa-account-manager@lacreativo.test", name: "QA Account Manager" },
  { role: "production", email: "qa-production@lacreativo.test", name: "QA Production" },
  { role: "finance", email: "qa-finance@lacreativo.test", name: "QA Finance" },
  { role: "hr", email: "qa-hr@lacreativo.test", name: "QA HR" },
  { role: "client", email: "qa-client@lacreativo.test", name: "QA Client" },
];

async function upsertUser(roleSeed: { role: string; email: string; name: string }) {
  const { role, email, name } = roleSeed;
  let user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) {
    user = await auth.createUser({ email, password: defaultPassword, displayName: name });
  } else {
    await auth.updateUser(user.uid, { password: defaultPassword, displayName: name });
  }

  await db.collection("users").doc(user.uid).set(
    {
      name,
      email,
      role,
      tenantId,
      status: "active",
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  return user.uid;
}

async function run() {
  const roleIds: Record<string, string> = {};
  for (const seed of roleSeeds) {
    roleIds[seed.role] = await upsertUser(seed);
  }

  const leadRef = db.collection("leads").doc();
  await leadRef.set({
    name: "QA Lead",
    email: "lead@lacreativo.test",
    phone: "+10000000000",
    source: "Seed",
    stage: "New",
    ownerId: roleIds.sales,
    ownerName: roleSeeds.find((r) => r.role === "sales")?.name || "Sales",
    isDeleted: false,
    tenantId,
    createdAt: now,
    updatedAt: now,
  });

  const clientRef = db.collection("clients").doc();
  await clientRef.set({
    companyName: "QA Client Co",
    primaryContactName: "QA Client",
    primaryContactEmail: "client@lacreativo.test",
    primaryContactEmailLower: "client@lacreativo.test",
    primaryContactPhone: "+10000000001",
    salesStage: "Closed Won",
    paymentStatus: "Paid",
    retainerStatus: "Active",
    salesOwner: roleSeeds.find((r) => r.role === "sales_manager")?.name || "Sales Manager",
    accountManager: roleSeeds.find((r) => r.role === "account_manager")?.name || "Account Manager",
    productionOwner: roleSeeds.find((r) => r.role === "production")?.name || "Production",
    tenantId,
    createdAt: now,
    updatedAt: now,
  });

  const invoiceRef = db.collection("invoices").doc();
  await invoiceRef.set({
    orderId: "INV-QA-0001",
    clientId: clientRef.id,
    clientName: "QA Client Co",
    currency: "USD",
    amountSubtotalUsd: 1000,
    amountTaxUsd: 0,
    amountTotalUsd: 1000,
    status: "Paid",
    dueDate: null,
    issuedAt: now,
    paidAt: now,
    lineItems: [{ name: "QA Retainer", qty: 1, unitPriceUsd: 1000 }],
    notes: "Seeded invoice",
    isDeleted: false,
    tenantId,
    createdAt: now,
    updatedAt: now,
  });

  const paymentRef = db.collection("payments").doc();
  await paymentRef.set({
    invoiceId: invoiceRef.id,
    clientId: clientRef.id,
    clientName: "QA Client Co",
    amountUsd: 1000,
    status: "Completed",
    paidAt: now,
    tenantId,
    createdAt: now,
    updatedAt: now,
  });

  const projectRef = db.collection("projects").doc();
  await projectRef.set({
    projectName: "QA Project",
    clientId: clientRef.id,
    clientName: "QA Client Co",
    status: "Active",
    stage: "Kickoff",
    productionUid: roleIds.production,
    productionName: roleSeeds.find((r) => r.role === "production")?.name || "Production",
    accountManagerUid: roleIds.account_manager,
    accountManagerName: roleSeeds.find((r) => r.role === "account_manager")?.name || "Account Manager",
    tenantId,
    createdAt: now,
    updatedAt: now,
  });

  const changeRequestRef = db.collection("changeRequests").doc();
  await changeRequestRef.set({
    projectId: projectRef.id,
    title: "QA Change Request",
    status: "Open",
    description: "Seeded change request",
    requestedBy: roleIds.account_manager,
    tenantId,
    createdAt: now,
    updatedAt: now,
  });

  const fileRef = db.collection("files").doc();
  await fileRef.set({
    projectId: projectRef.id,
    clientId: clientRef.id,
    fileName: "qa-file.txt",
    storagePath: "qa/qa-file.txt",
    uploadedBy: roleIds.production,
    downloadUrl: "https://example.com/qa-file.txt",
    tenantId,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection("notifications").add({
    toUserId: roleIds.admin,
    title: "Seed notification",
    body: "QA seed notification",
    type: "info",
    entityType: "project",
    entityId: projectRef.id,
    deepLink: "/admin/projects",
    tenantId,
    createdAt: now,
  });

  await db.collection("events").add({
    type: "qa.seeded",
    title: "QA seed complete",
    description: "Seed data created.",
    entityType: "system",
    entityId: "seed",
    createdAt: now,
    tenantId,
  });

  console.log("[seed] Seed data created.");
}

run().catch((err) => {
  console.error("[seed] Failed to seed:", err);
  process.exit(1);
});
