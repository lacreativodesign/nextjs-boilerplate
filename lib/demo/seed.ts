import admin from "firebase-admin";
import { adminAuth, adminDb } from "../firebaseAdmin";
import { DEFAULT_MODULES, DEFAULT_ROLES } from "../tenant/constants";

type SeedOptions = { tenantId?: string; reset?: boolean };
export type SeedCounts = {
  clients: number;
  leads: number;
  invoices: number;
  projects: number;
  productionJobs: number;
  employees: number;
  notifications: number;
  performanceTargets: number;
};

type DemoUser = { email: string; role: string; name: string };

const DEMO_TENANT_DEFAULT = "bizosto-demo";
export const DEMO_PASSWORD = "BizostoDemo2026!";

export const DEMO_USERS: DemoUser[] = [
  { email: "demo_admin@bizosto.com", role: "admin", name: "Alex Admin" },
  { email: "demo_sales@bizosto.com", role: "sales", name: "Sam Sales" },
  { email: "demo_sales_manager@bizosto.com", role: "sales_manager", name: "Sarah Manager" },
  { email: "demo_am@bizosto.com", role: "am", name: "Adam Account" },
  { email: "demo_am_manager@bizosto.com", role: "am_manager", name: "Amy Head" },
  { email: "demo_production@bizosto.com", role: "production", name: "Pete Production" },
  { email: "demo_production_manager@bizosto.com", role: "production_manager", name: "Paula Manager" },
  { email: "demo_finance@bizosto.com", role: "finance", name: "Frank Finance" },
  { email: "demo_hr@bizosto.com", role: "hr", name: "Hannah HR" },
  { email: "demo_client@bizosto.com", role: "client", name: "Chris Client" },
];

const CLIENT_SEEDS = [
  ["TechVision Solutions", "James Wilson", "james@techvision.com", "Technology"],
  ["Global Retail Co", "Maria Garcia", "maria@globalretail.com", "Retail"],
  ["BuildRight Construction", "Robert Chen", "robert@buildright.com", "Construction"],
  ["MediCore Health", "Sarah Johnson", "sarah@medicore.com", "Healthcare"],
  ["EduFirst Academy", "Michael Brown", "michael@edufirst.com", "Education"],
  ["GreenEnergy Corp", "Lisa Davis", "lisa@greenenergy.com", "Energy"],
  ["FastTrack Logistics", "David Kim", "david@fasttrack.com", "Logistics"],
  ["Creative Studio Pro", "Emma White", "emma@creativestudio.com", "Creative"],
  ["FinanceFirst Group", "Thomas Lee", "thomas@financefirst.com", "Finance"],
  ["PropertyPrime Realty", "Jennifer Martinez", "jennifer@propertyprime.com", "Real Estate"],
] as const;

const LEAD_STAGES = [
  "New Lead", "Contacted", "Qualified", "Proposal Sent", "Negotiation",
  "New Lead", "Contacted", "Qualified", "Proposal Sent", "Negotiation",
  "Closed Won", "Closed Won", "Closed Lost", "Proposal Sent", "Negotiation",
] as const;

function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

async function purgeByTenant(collectionName: string, tenantId: string): Promise<void> {
  while (true) {
    const snap = await adminDb.collection(collectionName).where("tenantId", "==", tenantId).limit(400).get();
    if (snap.empty) break;
    const batch = adminDb.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function ensureTenant(tenantId: string) {
  const now = new Date().toISOString();
  await adminDb.collection("tenants").doc(tenantId).set({
    id: tenantId,
    slug: tenantId,
    name: "Acme Corporation (Demo)",
    plan: "pro",
    status: "active",
    modulesEnabled: { ...DEFAULT_MODULES, tax: true },
    rolesEnabled: { ...DEFAULT_ROLES },
    settings: { currency: "USD", timezone: "America/New_York", dateFormat: "MM/DD/YYYY", language: "en" },
    updatedAt: now,
    metadata: { isDemo: true },
  }, { merge: true });
}

async function ensureDemoUsers(tenantId: string) {
  const uidByEmail = new Map<string, string>();
  const now = new Date().toISOString();
  for (const user of DEMO_USERS) {
    let authUser: admin.auth.UserRecord;
    try {
      authUser = await adminAuth.getUserByEmail(user.email);
    } catch {
      authUser = await adminAuth.createUser({ email: user.email, password: DEMO_PASSWORD, displayName: user.name });
    }
    await adminAuth.setCustomUserClaims(authUser.uid, { role: user.role, tenantId });
    await adminDb.collection("users").doc(authUser.uid).set({
      uid: authUser.uid,
      email: user.email,
      displayName: user.name,
      name: user.name,
      role: user.role,
      tenantId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
    uidByEmail.set(user.email, authUser.uid);
  }
  return uidByEmail;
}

async function upsertByUnique(collectionName: string, tenantId: string, uniqueKey: string, payload: Record<string, unknown>) {
  const value = String(payload[uniqueKey] ?? "");
  const existing = await adminDb.collection(collectionName)
    .where("tenantId", "==", tenantId)
    .where(uniqueKey, "==", value)
    .limit(1)
    .get();
  const ref = existing.empty ? adminDb.collection(collectionName).doc() : existing.docs[0].ref;
  await ref.set(payload, { merge: true });
  return ref.id;
}

export async function seedDemoEnvironment(options: SeedOptions = {}) {
  const tenantId = options.tenantId || DEMO_TENANT_DEFAULT;
  if (options.reset) {
    await Promise.all([
      purgeByTenant("clients", tenantId), purgeByTenant("invoices", tenantId), purgeByTenant("projects", tenantId),
      purgeByTenant("leads", tenantId), purgeByTenant("notifications", tenantId), purgeByTenant("performance_targets", tenantId),
      purgeByTenant("production_jobs", tenantId), purgeByTenant("employees", tenantId),
    ]);
  }

  await ensureTenant(tenantId);
  const uidByEmail = await ensureDemoUsers(tenantId);
  const amUid = uidByEmail.get("demo_am@bizosto.com") || null;
  const salesUid = uidByEmail.get("demo_sales@bizosto.com") || null;
  const prodUid = uidByEmail.get("demo_production@bizosto.com") || null;
  const adminUid = uidByEmail.get("demo_admin@bizosto.com") || null;
  const nowTs = admin.firestore.FieldValue.serverTimestamp();

  const clientIds: string[] = [];
  for (let i = 0; i < CLIENT_SEEDS.length; i += 1) {
    const [companyName, primaryContactName, primaryContactEmail, industry] = CLIENT_SEEDS[i];
    clientIds.push(await upsertByUnique("clients", tenantId, "companyName", {
      tenantId, companyName, primaryContactName, primaryContactEmail,
      phone: `+1-202-555-${String(1100 + i)}`,
      industry, country: "USA", address: `${100 + i} Market Street, Suite ${200 + i}, San Francisco, CA`,
      accountManager: amUid, status: "active", createdAt: isoDaysAgo(88 - i * 3), updatedAt: nowTs, isDeleted: false,
    }));
  }

  for (let i = 0; i < 15; i += 1) {
    await upsertByUnique("leads", tenantId, "title", {
      tenantId,
      title: `Opportunity ${String(i + 1).padStart(2, "0")}: ${CLIENT_SEEDS[i % CLIENT_SEEDS.length][0]}`,
      clientName: CLIENT_SEEDS[i % CLIENT_SEEDS.length][0],
      value: 5000 + i * 9000,
      stage: LEAD_STAGES[i],
      assignedTo: salesUid,
      ownerUid: salesUid,
      probability: LEAD_STAGES[i].includes("Closed") ? (LEAD_STAGES[i] === "Closed Won" ? 100 : 0) : 30 + (i % 5) * 12,
      notes: `Demo sales note ${i + 1}`,
      createdAt: isoDaysAgo(70 - i * 2),
      updatedAt: nowTs,
      isDeleted: false,
    });
  }

  const lineItems = [
    { description: "Brand Strategy Consulting", qty: 1, rate: 3500 },
    { description: "Website Design", qty: 1, rate: 8000 },
    { description: "Monthly Retainer", qty: 1, rate: 2500 },
    { description: "Social Media Management", qty: 3, rate: 1500 },
    { description: "SEO Optimization", qty: 1, rate: 4200 },
    { description: "Video Production", qty: 2, rate: 5000 },
    { description: "Photography Session", qty: 1, rate: 1800 },
    { description: "Print Design Package", qty: 1, rate: 2200 },
  ];
  const invoiceStatuses = ["draft", "draft", "sent", "sent", "sent", "paid", "paid", "paid", "paid", "paid", "overdue", "overdue"];
  for (let i = 0; i < 12; i += 1) {
    const selected = [lineItems[i % lineItems.length], lineItems[(i + 2) % lineItems.length], lineItems[(i + 5) % lineItems.length]];
    const subtotal = selected.reduce((sum, item) => sum + item.qty * item.rate, 0);
    const taxAmount = i % 2 === 0 ? Number((subtotal * 0.0825).toFixed(2)) : 0;
    const totalAmount = subtotal + taxAmount;
    const status = invoiceStatuses[i];
    await upsertByUnique("invoices", tenantId, "orderId", {
      tenantId, clientId: clientIds[i % clientIds.length], orderId: `INV-${String(i + 1).padStart(3, "0")}`,
      lineItems: selected, subtotal, taxAmount, totalAmount,
      amountSubtotal: subtotal, amountTax: taxAmount, amountTotal: totalAmount,
      amountSubtotalUsd: subtotal, amountTaxUsd: taxAmount, amountTotalUsd: totalAmount,
      currency: "USD", status, dueDate: isoDaysAgo(-(7 + i)), paidAt: status === "paid" ? isoDaysAgo(20 - i) : null,
      createdAt: isoDaysAgo(60 - i * 2), updatedAt: nowTs, isDeleted: false,
    });
  }

  const projectNames = [
    "TechVision Website Redesign", "Global Retail Brand Refresh", "BuildRight Marketing Campaign", "MediCore Patient Portal",
    "EduFirst Mobile App", "Annual Report 2025 — Creative Studio Pro", "GreenEnergy Social Media Strategy", "FastTrack Brand Identity",
  ];
  const projectStatuses = ["planning", "planning", "in_progress", "in_progress", "in_progress", "completed", "completed", "on_hold"];
  const projectIds: string[] = [];
  for (let i = 0; i < projectNames.length; i += 1) {
    projectIds.push(await upsertByUnique("projects", tenantId, "name", {
      tenantId, name: projectNames[i], projectName: projectNames[i], clientId: clientIds[i % clientIds.length],
      description: `${projectNames[i]} implementation for demo showcase.`, status: projectStatuses[i],
      startDate: isoDaysAgo(50 - i * 3), endDate: isoDaysAgo(-(30 - i * 2)), budget: 25000 + i * 9000,
      assignedTo: amUid, ownerAmUid: amUid, isDeleted: false, createdAt: isoDaysAgo(55 - i * 3), updatedAt: nowTs,
    }));
  }

  const prodStatuses = ["queued", "queued", "queued", "in_progress", "in_progress", "in_progress", "in_progress", "completed", "completed", "completed"];
  for (let i = 0; i < 10; i += 1) {
    await upsertByUnique("production_jobs", tenantId, "title", {
      tenantId, title: `Production Job ${String(i + 1).padStart(2, "0")}`, projectId: projectIds[i % projectIds.length],
      assignedTo: prodUid, priority: i % 3 === 0 ? "high" : i % 2 === 0 ? "medium" : "low", status: prodStatuses[i],
      estimatedHours: 8 + i * 2, actualHours: prodStatuses[i] === "completed" ? 10 + i : null,
      dueDate: isoDaysAgo(-(5 + i)), createdAt: isoDaysAgo(40 - i * 2), updatedAt: nowTs, isDeleted: false,
    });
  }

  const employees = [
    ["John", "Smith", "Engineering", "Senior Developer", 95000], ["Emily", "Johnson", "Marketing", "Marketing Manager", 75000],
    ["Michael", "Williams", "Sales", "Sales Executive", 65000], ["Jessica", "Brown", "Design", "UI/UX Designer", 80000],
    ["Daniel", "Jones", "Operations", "Operations Manager", 85000], ["Ashley", "Davis", "HR", "HR Coordinator", 60000],
    ["Matthew", "Wilson", "Finance", "Financial Analyst", 72000], ["Amanda", "Taylor", "Client Services", "Account Executive", 68000],
  ] as const;
  for (let i = 0; i < employees.length; i += 1) {
    const [firstName, lastName, department, position, salary] = employees[i];
    await upsertByUnique("employees", tenantId, "email", {
      tenantId, firstName, lastName, name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@acme-demo.com`,
      department, position, startDate: isoDaysAgo(80 - i * 4), salary, status: "active",
      createdAt: isoDaysAgo(70 - i * 3), updatedAt: nowTs, isDeleted: false,
    });
  }

  const targetDefs: Array<{ email: string; metrics: Record<string, { label: string; target: number; unit: string }> }> = [
    { email: "demo_sales@bizosto.com", metrics: { leadsCreated: { label: "Leads Created", target: 20, unit: "count" }, dealsClosed: { label: "Deals Closed", target: 5, unit: "count" }, revenueGenerated: { label: "Revenue", target: 50000, unit: "USD" } } },
    { email: "demo_am@bizosto.com", metrics: { activeClients: { label: "Active Clients", target: 8, unit: "count" }, projectsCompleted: { label: "Projects Completed", target: 3, unit: "count" } } },
    { email: "demo_production@bizosto.com", metrics: { jobsCompleted: { label: "Jobs Completed", target: 15, unit: "count" } } },
    { email: "demo_finance@bizosto.com", metrics: { invoicesCreated: { label: "Invoices Created", target: 20, unit: "count" }, revenueInvoiced: { label: "Revenue Invoiced", target: 80000, unit: "USD" } } },
  ];
  for (const def of targetDefs) {
    const userId = uidByEmail.get(def.email);
    if (!userId) continue;
    await upsertByUnique("performance_targets", tenantId, "userId", {
      tenantId, userId, period: "2026-02", periodType: "monthly", metrics: def.metrics,
      isDeleted: false, createdAt: isoDaysAgo(5), updatedAt: nowTs,
    });
  }

  const notifs = [
    ["invoice_paid", "Invoice Paid", "INV-007 was paid in full.", false],
    ["new_lead", "New Lead Assigned", "A new enterprise lead was assigned to sales.", false],
    ["project_update", "Project Status Updated", "MediCore Patient Portal moved to in_progress.", false],
    ["payment_due", "Payment Due Reminder", "INV-011 is due in 3 days.", true],
    ["system", "Demo System Ready", "Demo tenant has been refreshed successfully.", true],
  ] as const;
  for (const [type, title, message, read] of notifs) {
    await upsertByUnique("notifications", tenantId, "title", {
      tenantId, userId: adminUid, toUserId: adminUid, recipientUid: adminUid,
      type, title, message, read, isRead: read, createdAt: nowTs,
    });
  }

  return {
    tenantId,
    counts: { clients: 10, leads: 15, invoices: 12, projects: 8, productionJobs: 10, employees: 8, notifications: 5, performanceTargets: 4 },
    users: DEMO_USERS,
  };
}
