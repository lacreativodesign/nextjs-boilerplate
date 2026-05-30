import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

const DEMO_PASSWORD = "BizostoDemo2026!";
const _TENANT_ID = "bizosto-demo";

const DEMO_USERS = [
  { email: "demo_admin@bizosto.com", role: "admin", name: "Alex Admin", uid: "" },
  { email: "demo_sales@bizosto.com", role: "sales", name: "Sam Sales", uid: "" },
  { email: "demo_sales_manager@bizosto.com", role: "sales_manager", name: "Sarah Manager", uid: "" },
  { email: "demo_am@bizosto.com", role: "am", name: "Adam Account", uid: "" },
  { email: "demo_am_manager@bizosto.com", role: "am_manager", name: "Amy Head", uid: "" },
  { email: "demo_production@bizosto.com", role: "production", name: "Pete Production", uid: "" },
  { email: "demo_production_manager@bizosto.com", role: "production_manager", name: "Paula Manager", uid: "" },
  { email: "demo_finance@bizosto.com", role: "finance", name: "Frank Finance", uid: "" },
  { email: "demo_hr@bizosto.com", role: "hr", name: "Hannah HR", uid: "" },
  { email: "demo_client@bizosto.com", role: "client", name: "Chris Client", uid: "" },
] as const;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function id(): string {
  return adminDb.collection("_").doc().id;
}

export async function seedDemoTenant({ tenantId }: { tenantId: string }) {
  const now = new Date().toISOString();

  // ─── 1. Create / update tenant document ─────────────────────────────────────
  await adminDb.collection("tenants").doc(tenantId).set(
    {
      id: tenantId,
      name: "Nexus Creative Studio",
      slug: tenantId,
      plan: "pro",
      status: "active",
      subscriptionState: "active",
      billingStatus: "paid",
      modulesEnabled: {
        admin: true, clients: true, users: true, sales: true,
        accountManager: true, production: true, finance: true,
        humanResource: true, dashboard: true, notifications: true,
        salesManager: true, headOfProjectManagement: true, headOfProduction: true,
      },
      trialEndsAt: daysFromNow(14),
      createdAt: now,
      updatedAt: now,
      isDemo: true,
    },
    { merge: true }
  );

  // ─── 2. Create Firebase Auth accounts ───────────────────────────────────────
  const resolvedUsers: { email: string; role: string; name: string; uid: string }[] = [];

  for (const user of DEMO_USERS) {
    let uid: string;
    try {
      const created = await adminAuth.createUser({
        email: user.email,
        password: DEMO_PASSWORD,
        displayName: user.name,
        emailVerified: true,
      });
      uid = created.uid;
    } catch (err) {
      if ((err as Record<string, unknown>)?.code === "auth/email-already-exists") {
        const existing = await adminAuth.getUserByEmail(user.email);
        await adminAuth.updateUser(existing.uid, {
          password: DEMO_PASSWORD,
          displayName: user.name,
          emailVerified: true,
        });
        uid = existing.uid;
      } else {
        throw err;
      }
    }

    await adminAuth.setCustomUserClaims(uid, { role: user.role, tenantId });
    resolvedUsers.push({ ...user, uid });
  }

  const adminUser = resolvedUsers.find((u) => u.role === "admin")!;
  const salesUser = resolvedUsers.find((u) => u.role === "sales")!;
  const amUser = resolvedUsers.find((u) => u.role === "am")!;
  const financeUser = resolvedUsers.find((u) => u.role === "finance")!;
  const _hrUser = resolvedUsers.find((u) => u.role === "hr")!;
  const productionUser = resolvedUsers.find((u) => u.role === "production")!;
  const _clientUser = resolvedUsers.find((u) => u.role === "client")!;

  // ─── 3. Create Firestore user documents ─────────────────────────────────────
  const batch1 = adminDb.batch();
  for (const u of resolvedUsers) {
    const ref = adminDb.collection("users").doc(u.uid);
    batch1.set(ref, {
      uid: u.uid,
      email: u.email,
      fullName: u.name,
      role: u.role,
      tenantId,
      status: "active",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      isDemo: true,
    }, { merge: true });
  }
  await batch1.commit();

  // ─── 4. Clients ──────────────────────────────────────────────────────────────
  const clients = [
    { id: id(), name: "TechVision Inc", email: "contact@techvision.com", phone: "+1 (555) 201-0101", industry: "Technology", status: "active", tier: "enterprise", assignedTo: amUser.uid, assignedName: amUser.name },
    { id: id(), name: "Bloom Beauty Co", email: "hello@bloombeauty.com", phone: "+1 (555) 202-0202", industry: "Retail", status: "active", tier: "pro", assignedTo: amUser.uid, assignedName: amUser.name },
    { id: id(), name: "Summit Partners", email: "ops@summitpartners.com", phone: "+1 (555) 203-0303", industry: "Consulting", status: "active", tier: "pro", assignedTo: amUser.uid, assignedName: amUser.name },
    { id: id(), name: "ClearPath Logistics", email: "info@clearpath.com", phone: "+1 (555) 204-0404", industry: "Logistics", status: "active", tier: "starter", assignedTo: amUser.uid, assignedName: amUser.name },
    { id: id(), name: "Nova Media Group", email: "team@novamedia.com", phone: "+1 (555) 205-0505", industry: "Media", status: "inactive", tier: "starter", assignedTo: amUser.uid, assignedName: amUser.name },
  ];

  const batch2 = adminDb.batch();
  for (const c of clients) {
    batch2.set(adminDb.collection("clients").doc(c.id), {
      ...c, tenantId, createdAt: daysAgo(60), updatedAt: now, isDemo: true,
    });
  }
  await batch2.commit();

  // ─── 5. Leads ────────────────────────────────────────────────────────────────
  const leadData = [
    { name: "Jordan Bell", company: "Apex Digital", email: "jordan@apexdigital.com", stage: "New", source: "Website", value: 8500, daysOld: 3 },
    { name: "Priya Sharma", company: "Greenfield Tech", email: "priya@greenfield.io", stage: "New", source: "Referral", value: 12000, daysOld: 5 },
    { name: "Marcus Chen", company: "BlueSky Ventures", email: "marcus@bluesky.vc", stage: "Contacted", source: "LinkedIn", value: 6500, daysOld: 12 },
    { name: "Sofia Ramirez", company: "Coastal Brands", email: "sofia@coastalbrands.com", stage: "Contacted", source: "Cold Outreach", value: 4200, daysOld: 15 },
    { name: "Ethan Park", company: "Spark Digital", email: "ethan@sparkdigital.com", stage: "Qualified", source: "Website", value: 18000, daysOld: 22 },
    { name: "Luna Torres", company: "Meridian Agency", email: "luna@meridian.agency", stage: "Qualified", source: "Event", value: 9800, daysOld: 28 },
    { name: "Caleb Moore", company: "Vertex Solutions", email: "caleb@vertex.io", stage: "Proposal", source: "Referral", value: 24000, daysOld: 35 },
    { name: "Aria Patel", company: "Crestline Creative", email: "aria@crestline.co", stage: "Negotiation", source: "Website", value: 31000, daysOld: 45 },
  ];

  const leads: unknown[] = leadData.map((l) => ({
    id: id(),
    tenantId,
    name: l.name,
    company: l.company,
    email: l.email,
    phone: "+1 (555) 300-0000",
    stage: l.stage,
    source: l.source,
    estimatedValue: l.value,
    status: "active",
    assignedTo: salesUser.uid,
    ownerName: salesUser.name,
    notes: `Lead from ${l.source} — ${l.stage} stage.`,
    createdAt: daysAgo(l.daysOld),
    updatedAt: now,
    isDemo: true,
  }));

  const batch3 = adminDb.batch();
  for (const l of leads) {
    batch3.set(adminDb.collection("leads").doc((l as Record<string, unknown>).id), l);
  }
  await batch3.commit();

  // ─── 6. Projects ─────────────────────────────────────────────────────────────
  const projectData = [
    { name: "TechVision Brand Refresh", client: clients[0], stage: "Active", health: "on_track", budget: 28000, dueInDays: 21 },
    { name: "Bloom Beauty E-commerce Redesign", client: clients[1], stage: "Active", health: "at_risk", budget: 18500, dueInDays: 7 },
    { name: "Summit Partners Marketing Strategy", client: clients[2], stage: "In Review", health: "on_track", budget: 12000, dueInDays: 3 },
    { name: "ClearPath Brand Identity", client: clients[3], stage: "On Hold", health: "unknown", budget: 8500, dueInDays: 45 },
    { name: "Nova Media Social Campaign", client: clients[4], stage: "Active", health: "on_track", budget: 5200, dueInDays: 14 },
  ];

  const projects: unknown[] = projectData.map((p) => ({
    id: id(),
    tenantId,
    projectName: p.name,
    clientId: p.client.id,
    clientName: p.client.name,
    stage: p.stage,
    health: p.health,
    budget: p.budget,
    spent: Math.round(p.budget * 0.6),
    assignedTo: amUser.uid,
    ownerAmName: amUser.name,
    productionAssignedTo: productionUser.uid,
    dueDate: daysFromNow(p.dueInDays),
    startDate: daysAgo(30),
    description: `${p.name} — managed by ${amUser.name}.`,
    createdAt: daysAgo(35),
    updatedAt: now,
    isDemo: true,
  }));

  const batch4 = adminDb.batch();
  for (const p of projects) {
    batch4.set(adminDb.collection("projects").doc((p as Record<string, unknown>).id), p);
  }
  await batch4.commit();

  // ─── 7. Invoices ─────────────────────────────────────────────────────────────
  const invoiceData = [
    { client: clients[0], amount: 14000, isPaid: true, daysOffset: -45, orderId: "INV-0001" },
    { client: clients[1], amount: 9250, isPaid: true, daysOffset: -30, orderId: "INV-0002" },
    { client: clients[2], amount: 6000, isPaid: false, daysOffset: -18, orderId: "INV-0003" },
    { client: clients[3], amount: 4250, isPaid: false, daysOffset: -9, orderId: "INV-0004" },
    { client: clients[4], amount: 2600, isPaid: false, daysOffset: 14, orderId: "INV-0005" },
  ];

  const invoices: unknown[] = invoiceData.map((inv) => ({
    id: id(),
    tenantId,
    orderId: inv.orderId,
    clientId: inv.client.id,
    clientName: inv.client.name,
    clientEmail: inv.client.email,
    amountTotalUsd: inv.amount,
    isPaid: inv.isPaid,
    status: inv.isPaid ? "paid" : inv.daysOffset < 0 ? "overdue" : "pending",
    dueDate: daysFromNow(inv.daysOffset),
    issuedDate: daysAgo(Math.abs(inv.daysOffset) + 14),
    paidAt: inv.isPaid ? daysAgo(Math.abs(inv.daysOffset) - 5) : null,
    lineItems: [{ description: "Professional Services", quantity: 1, unitPrice: inv.amount, total: inv.amount }],
    notes: "Net 14 payment terms.",
    createdAt: daysAgo(Math.abs(inv.daysOffset) + 14),
    updatedAt: now,
    isDemo: true,
  }));

  const batch5 = adminDb.batch();
  for (const inv of invoices) {
    batch5.set(adminDb.collection("invoices").doc((inv as Record<string, unknown>).id), inv);
  }
  await batch5.commit();

  // ─── 8. Employees ────────────────────────────────────────────────────────────
  const employeeData = [
    { name: "Morgan Davis", role: "Marketing Manager", dept: "Marketing", salary: 72000, status: "active" },
    { name: "Riley Chen", role: "Senior Designer", dept: "Creative", salary: 68000, status: "active" },
    { name: "Casey Williams", role: "Account Executive", dept: "Sales", salary: 58000, status: "active" },
    { name: "Quinn Johnson", role: "Finance Controller", dept: "Finance", salary: 80000, status: "active" },
  ];

  const batch6 = adminDb.batch();
  for (const emp of employeeData) {
    const ref = adminDb.collection("employees").doc(id());
    batch6.set(ref, {
      id: ref.id,
      tenantId,
      fullName: emp.name,
      jobTitle: emp.role,
      department: emp.dept,
      salary: emp.salary,
      currency: "USD",
      status: emp.status,
      startDate: daysAgo(180),
      email: `${emp.name.toLowerCase().replace(" ", ".")}@nexuscreative.demo`,
      managerId: adminUser.uid,
      createdAt: daysAgo(180),
      updatedAt: now,
      isDemo: true,
    });
  }
  await batch6.commit();

  // ─── 9. Production jobs ──────────────────────────────────────────────────────
  const productionJobData = [
    { title: "Website Redesign Assets", client: clients[0], project: projects[0], status: "in_progress" },
    { title: "Social Media Content Pack", client: clients[4], project: projects[4], status: "review" },
    { title: "Brand Style Guide", client: clients[2], project: projects[2], status: "completed" },
  ];

  const batch7 = adminDb.batch();
  for (const job of productionJobData) {
    const ref = adminDb.collection("production_jobs").doc(id());
    batch7.set(ref, {
      id: ref.id,
      tenantId,
      title: job.title,
      clientId: job.client.id,
      clientName: job.client.name,
      projectId: (job.project as Record<string, unknown>).id,
      projectName: (job.project as Record<string, unknown>).projectName,
      status: job.status,
      assignedTo: productionUser.uid,
      assignedName: productionUser.name,
      dueDate: daysFromNow(10),
      createdAt: daysAgo(20),
      updatedAt: now,
      isDemo: true,
    });
  }
  await batch7.commit();

  // ─── 10. Notifications ───────────────────────────────────────────────────────
  const notifData = [
    { userId: adminUser.uid, title: "Invoice overdue", body: "INV-0003 from Summit Partners is 18 days overdue.", type: "invoice" },
    { userId: adminUser.uid, title: "Invoice overdue", body: "INV-0004 from ClearPath Logistics is 9 days overdue.", type: "invoice" },
    { userId: adminUser.uid, title: "Project at risk", body: "Bloom Beauty E-commerce Redesign is marked at risk.", type: "project" },
    { userId: salesUser.uid, title: "New lead assigned", body: "Jordan Bell from Apex Digital has been assigned to you.", type: "lead" },
    { userId: financeUser.uid, title: "Payroll due", body: "Monthly payroll run is due in 3 days.", type: "hr" },
  ];

  const batch8 = adminDb.batch();
  for (const n of notifData) {
    const ref = adminDb.collection("notifications").doc(id());
    batch8.set(ref, {
      id: ref.id,
      tenantId,
      userId: n.userId,
      title: n.title,
      body: n.body,
      type: n.type,
      read: false,
      createdAt: daysAgo(1),
      isDemo: true,
    });
  }
  await batch8.commit();

  // ─── 11. Audit log entry ─────────────────────────────────────────────────────
  await adminDb.collection("auditLogs").doc(id()).set({
    tenantId,
    actorUserId: "system",
    actorName: "Demo Seeder",
    actorRole: "super_admin",
    actionType: "demo.seeded",
    entityType: "tenant",
    entityId: tenantId,
    metadata: { seededAt: now },
    createdAt: now,
  });

  return {
    counts: {
      clients: clients.length,
      leads: leads.length,
      invoices: invoices.length,
      projects: projects.length,
      productionJobs: productionJobData.length,
      employees: employeeData.length,
    },
  };
}
