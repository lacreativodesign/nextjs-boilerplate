import admin from "firebase-admin";
import { adminDb } from "../lib/firebaseAdmin";
import { maybeAutoCreateProjectFromInvoice } from "../lib/finance/invoiceActions";
import { createNotification } from "../lib/notifications";

function buildUsageMessage() {
  return "Usage: tsx scripts/seedDemoTenant.ts <TENANT_ID>";
}

async function run() {
  const tenantId = process.argv[2] || process.env.DEMO_TENANT_ID || process.env.DEFAULT_TENANT_ID;
  if (!tenantId) {
    console.error("Missing TENANT_ID.", buildUsageMessage());
    process.exit(1);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  await adminDb.collection("tenants").doc(tenantId).set(
    {
      name: "Demo Tenant",
      updatedAt: now,
    },
    { merge: true }
  );

  const clientRef = adminDb.collection("clients").doc();
  const clientData = {
    tenantId,
    companyName: "Acme Demo Co.",
    primaryContactName: "Jordan Demo",
    primaryContactEmail: "demo@example.com",
    accountManager: null,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };
  await clientRef.set(clientData);

  const invoiceRef = adminDb.collection("invoices").doc();
  const invoiceData = {
    tenantId,
    clientId: clientRef.id,
    clientName: clientData.companyName,
    orderId: `DEMO-${invoiceRef.id.slice(0, 5).toUpperCase()}`,
    currency: "USD",
    amountSubtotalUsd: 1200,
    amountTaxUsd: 0,
    amountTotalUsd: 1200,
    status: "paid",
    totalPaid: 1200,
    balanceDue: 0,
    type: "service",
    issuedAt: now,
    paidAt: now,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  };
  await invoiceRef.set(invoiceData);

  const paymentRef = adminDb.collection("payments").doc();
  await paymentRef.set({
    id: paymentRef.id,
    tenantId,
    clientId: clientRef.id,
    clientName: clientData.companyName,
    invoiceId: invoiceRef.id,
    amountUsd: 1200,
    currency: "USD",
    status: "succeeded",
    paidAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const project = await maybeAutoCreateProjectFromInvoice({
    invoiceId: invoiceRef.id,
    invoiceData: { ...invoiceData, status: "paid" },
    tenantId,
    actor: { uid: "seed", name: "Demo Seed" },
  });

  await createNotification({
    toUserId: "demo-user",
    title: "Demo tenant seeded",
    body: `Demo tenant ${tenantId} seeded with client, invoice, payment, and project.`,
    type: "system",
    entityType: "client",
    entityId: clientRef.id,
    tenantId,
    roleTarget: "demo",
    createdBy: { uid: "seed", name: "Demo Seed" },
  });

  if (project?.id) {
    await createNotification({
      toUserId: "demo-user",
      title: "Demo project created",
      body: `Project ${project.id} auto-created from paid invoice.`,
      type: "success",
      entityType: "project",
      entityId: project.id,
      tenantId,
      roleTarget: "demo",
      createdBy: { uid: "seed", name: "Demo Seed" },
    });
  }

  console.log(
    `[seed-demo] tenant=${tenantId} client=${clientRef.id} invoice=${invoiceRef.id} payment=${paymentRef.id} project=${
      project?.id || "n/a"
    }`
  );
}

run().catch((error) => {
  console.error("Demo tenant seed failed:", error);
  process.exit(1);
});
