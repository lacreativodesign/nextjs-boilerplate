import { adminDb, adminAuth } from '@/lib/firebaseAdmin';

export const DEMO_TENANT_ID = 'bizosto-demo';

export const DEMO_USERS = [
  { email: 'demo_admin@bizosto.com', role: 'admin', name: 'Alex Admin' },
  { email: 'demo_sales@bizosto.com', role: 'sales', name: 'Sam Sales' },
  { email: 'demo_sales_manager@bizosto.com', role: 'sales_manager', name: 'Sarah Manager' },
  { email: 'demo_am@bizosto.com', role: 'am', name: 'Adam Account' },
  { email: 'demo_am_manager@bizosto.com', role: 'am_manager', name: 'Amy Head' },
  { email: 'demo_production@bizosto.com', role: 'production', name: 'Pete Production' },
  {
    email: 'demo_production_manager@bizosto.com',
    role: 'production_manager',
    name: 'Paula Manager',
  },
  { email: 'demo_finance@bizosto.com', role: 'finance', name: 'Frank Finance' },
  { email: 'demo_hr@bizosto.com', role: 'hr', name: 'Hannah HR' },
  { email: 'demo_client@bizosto.com', role: 'client', name: 'Chris Client' },
] as const;

const DEMO_COLLECTIONS = [
  'clients',
  'leads',
  'deals',
  'projects',
  'invoices',
  'employees',
  'production_jobs',
  'notifications',
  'auditLogs',
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

export function requireDemoPassword(env: NodeJS.ProcessEnv = process.env): string {
  const password = String(env.E2E_DEMO_PASSWORD || '').trim();
  if (password.length < 16) {
    throw new Error('E2E_DEMO_PASSWORD must be configured with at least 16 characters');
  }
  return password;
}

async function deleteTenantCollection(collectionName: string, tenantId: string): Promise<void> {
  while (true) {
    const snap = await adminDb
      .collection(collectionName)
      .where('tenantId', '==', tenantId)
      .limit(400)
      .get();

    if (snap.empty) return;

    const batch = adminDb.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();

    if (snap.size < 400) return;
  }
}

export async function resetDemoTenantData(tenantId = DEMO_TENANT_ID): Promise<void> {
  for (const collectionName of DEMO_COLLECTIONS) {
    await deleteTenantCollection(collectionName, tenantId);
  }
}

type SeedOptions = {
  tenantId?: string;
  password?: string;
};

export async function seedDemoTenant(options: SeedOptions = {}) {
  const tenantId = options.tenantId || DEMO_TENANT_ID;
  const password = options.password || requireDemoPassword();
  const now = new Date().toISOString();

  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .set(
      {
        id: tenantId,
        name: 'Nexus Creative Studio',
        slug: tenantId,
        plan: 'pro',
        status: 'active',
        subscriptionState: 'active',
        billingStatus: 'paid',
        modulesEnabled: {
          admin: true,
          clients: true,
          users: true,
          sales: true,
          accountManager: true,
          production: true,
          finance: true,
          humanResource: true,
          dashboard: true,
          notifications: true,
          salesManager: true,
          headOfProjectManagement: true,
          headOfProduction: true,
        },
        rolesEnabled: {
          admin: true,
          sales: true,
          sales_manager: true,
          am: true,
          am_manager: true,
          production: true,
          production_manager: true,
          finance: true,
          hr: true,
          client: true,
        },
        trialEndsAt: daysFromNow(14),
        createdAt: now,
        updatedAt: now,
        isDemo: true,
      },
      { merge: true },
    );

  const resolvedUsers: Array<{ email: string; role: string; name: string; uid: string }> = [];
  for (const user of DEMO_USERS) {
    let uid: string;
    try {
      const created = await adminAuth.createUser({
        email: user.email,
        password,
        displayName: user.name,
        emailVerified: true,
      });
      uid = created.uid;
    } catch (error: any) {
      if (error?.code !== 'auth/email-already-exists') throw error;
      const existing = await adminAuth.getUserByEmail(user.email);
      await adminAuth.updateUser(existing.uid, {
        password,
        displayName: user.name,
        emailVerified: true,
        disabled: false,
      });
      uid = existing.uid;
    }

    await adminAuth.setCustomUserClaims(uid, { role: user.role, tenantId });
    resolvedUsers.push({ ...user, uid });
  }

  const userFor = (role: string) => {
    const user = resolvedUsers.find((entry) => entry.role === role);
    if (!user) throw new Error(`Missing demo user for role ${role}`);
    return user;
  };

  const adminUser = userFor('admin');
  const salesUser = userFor('sales');
  const amUser = userFor('am');
  const productionUser = userFor('production');
  const financeUser = userFor('finance');
  const clientUser = userFor('client');

  const clients = [
    {
      id: 'demo-client-techvision',
      companyName: 'TechVision Inc',
      email: 'demo_client@bizosto.com',
      phone: '+1 (555) 201-0101',
      industry: 'Technology',
      status: 'active',
      tier: 'enterprise',
    },
    {
      id: 'demo-client-bloom',
      companyName: 'Bloom Beauty Co',
      email: 'hello@bloombeauty.com',
      phone: '+1 (555) 202-0202',
      industry: 'Retail',
      status: 'active',
      tier: 'pro',
    },
    {
      id: 'demo-client-summit',
      companyName: 'Summit Partners',
      email: 'ops@summitpartners.com',
      phone: '+1 (555) 203-0303',
      industry: 'Consulting',
      status: 'active',
      tier: 'pro',
    },
    {
      id: 'demo-client-clearpath',
      companyName: 'ClearPath Logistics',
      email: 'info@clearpath.com',
      phone: '+1 (555) 204-0404',
      industry: 'Logistics',
      status: 'active',
      tier: 'starter',
    },
    {
      id: 'demo-client-nova',
      companyName: 'Nova Media Group',
      email: 'team@novamedia.com',
      phone: '+1 (555) 205-0505',
      industry: 'Media',
      status: 'inactive',
      tier: 'starter',
    },
  ];

  const usersBatch = adminDb.batch();
  for (const user of resolvedUsers) {
    usersBatch.set(
      adminDb.collection('users').doc(user.uid),
      {
        uid: user.uid,
        email: user.email,
        fullName: user.name,
        name: user.name,
        role: user.role,
        tenantId,
        status: 'active',
        isDeleted: false,
        emailVerified: true,
        clientId: user.role === 'client' ? clients[0].id : null,
        createdAt: now,
        updatedAt: now,
        isDemo: true,
      },
      { merge: true },
    );
  }
  await usersBatch.commit();

  const clientsBatch = adminDb.batch();
  for (const client of clients) {
    clientsBatch.set(adminDb.collection('clients').doc(client.id), {
      id: client.id,
      tenantId,
      name: client.companyName,
      companyName: client.companyName,
      email: client.email,
      primaryContactName: client.companyName,
      primaryContactEmail: client.email,
      primaryContactEmailLower: client.email.toLowerCase(),
      primaryContactPhone: client.phone,
      phone: client.phone,
      industry: client.industry,
      status: client.status,
      tier: client.tier,
      salesStage: 'Closed Won',
      paymentStatus: 'Paid',
      salesOwner: salesUser.name,
      accountManager: amUser.name,
      productionOwner: productionUser.name,
      assignedTo: amUser.uid,
      assignedName: amUser.name,
      portalUserUid: client.id === clients[0].id ? clientUser.uid : null,
      createdAt: daysAgo(60),
      updatedAt: now,
      isDemo: true,
    });
  }
  await clientsBatch.commit();

  const leads = [
    ['demo-lead-apex', 'Jordan Bell', 'Apex Digital', 'jordan@apexdigital.com', 'New', 'Website', 8500, 3],
    ['demo-lead-greenfield', 'Priya Sharma', 'Greenfield Tech', 'priya@greenfield.io', 'New', 'Referral', 12000, 5],
    ['demo-lead-bluesky', 'Marcus Chen', 'BlueSky Ventures', 'marcus@bluesky.vc', 'Contacted', 'LinkedIn', 6500, 12],
    ['demo-lead-coastal', 'Sofia Ramirez', 'Coastal Brands', 'sofia@coastalbrands.com', 'Contacted', 'Cold Outreach', 4200, 15],
    ['demo-lead-spark', 'Ethan Park', 'Spark Digital', 'ethan@sparkdigital.com', 'Qualified', 'Website', 18000, 22],
  ] as const;

  const leadsBatch = adminDb.batch();
  for (const [id, name, company, email, stage, source, value, age] of leads) {
    leadsBatch.set(adminDb.collection('leads').doc(id), {
      id,
      tenantId,
      name,
      company,
      email,
      phone: '+1 (555) 300-0000',
      stage,
      source,
      estimatedValue: value,
      status: 'active',
      createdBy: salesUser.uid,
      assignedTo: salesUser.uid,
      ownerName: salesUser.name,
      notes: `Lead from ${source} — ${stage} stage.`,
      createdAt: daysAgo(age),
      updatedAt: now,
      isDeleted: false,
      isDemo: true,
    });
  }
  await leadsBatch.commit();

  await adminDb.collection('deals').doc('demo-deal-techvision').set({
    id: 'demo-deal-techvision',
    tenantId,
    leadId: 'demo-lead-apex',
    customerId: clients[0].id,
    customerName: clients[0].companyName,
    title: 'TechVision Brand Refresh Deal',
    name: 'TechVision Brand Refresh Deal',
    valueUSD: 28000,
    value: 28000,
    currency: 'USD',
    stage: 'negotiation',
    stageName: 'Negotiation',
    ownerId: salesUser.uid,
    ownerName: salesUser.name,
    assignedSalesId: salesUser.uid,
    isDeleted: false,
    createdAt: daysAgo(40),
    updatedAt: now,
    isDemo: true,
  });

  const projects = [
    ['demo-project-techvision', 'TechVision Brand Refresh', clients[0], 'Kickoff', 28000, 21],
    ['demo-project-bloom', 'Bloom Beauty E-commerce Redesign', clients[1], 'Review', 18500, 7],
    ['demo-project-summit', 'Summit Partners Marketing Strategy', clients[2], 'Draft', 12000, 3],
  ] as const;

  const projectsBatch = adminDb.batch();
  for (const [id, projectName, client, stage, budget, dueInDays] of projects) {
    projectsBatch.set(adminDb.collection('projects').doc(id), {
      id,
      tenantId,
      projectCode: id === 'demo-project-techvision' ? 'DEMO-0001' : null,
      projectName,
      projectType: 'Professional Services',
      clientId: client.id,
      clientName: client.companyName,
      stage,
      priority: 'Normal',
      health: dueInDays <= 7 ? 'at_risk' : 'on_track',
      budget,
      spent: Math.round(budget * 0.6),
      createdByUid: adminUser.uid,
      createdByName: adminUser.name,
      ownerAmUid: amUser.uid,
      ownerAmName: amUser.name,
      productionUid: productionUser.uid,
      productionName: productionUser.name,
      assignedTo: amUser.uid,
      productionAssignedTo: productionUser.uid,
      dueDate: daysFromNow(dueInDays),
      startDate: daysAgo(30),
      description: `${projectName} — managed by ${amUser.name}.`,
      clientApprovalStatus: 'pending',
      isDeleted: false,
      createdAt: daysAgo(35),
      updatedAt: now,
      isDemo: true,
    });
  }
  await projectsBatch.commit();

  const invoices = [
    ['demo-invoice-0001', clients[0], 14000, 'paid', -45, 'INV-0001'],
    ['demo-invoice-0002', clients[1], 9250, 'paid', -30, 'INV-0002'],
    ['demo-invoice-0003', clients[2], 6000, 'overdue', -18, 'INV-0003'],
    ['demo-invoice-0004', clients[3], 4250, 'overdue', -9, 'INV-0004'],
  ] as const;

  const invoicesBatch = adminDb.batch();
  for (const [id, client, amount, status, dueOffset, orderId] of invoices) {
    invoicesBatch.set(adminDb.collection('invoices').doc(id), {
      id,
      tenantId,
      orderId,
      clientId: client.id,
      clientName: client.companyName,
      clientEmail: client.email,
      currency: 'USD',
      amountSubtotal: amount,
      amountSubtotalUsd: amount,
      amountTax: 0,
      amountTaxUsd: 0,
      amountTotal: amount,
      amountTotalUsd: amount,
      totalUSD: amount,
      isPaid: status === 'paid',
      status,
      dueDate: daysFromNow(dueOffset),
      issuedAt: daysAgo(Math.abs(dueOffset) + 14),
      paidAt: status === 'paid' ? daysAgo(Math.max(1, Math.abs(dueOffset) - 5)) : null,
      lineItems: [
        { description: 'Professional Services', quantity: 1, unitPrice: amount, total: amount },
      ],
      notes: 'Net 14 payment terms.',
      isDeleted: false,
      createdAt: daysAgo(Math.abs(dueOffset) + 14),
      updatedAt: now,
      isDemo: true,
    });
  }
  await invoicesBatch.commit();

  const employees = [
    ['demo-employee-morgan', 'Morgan Davis', 'Marketing Manager', 'Marketing', 72000],
    ['demo-employee-riley', 'Riley Chen', 'Senior Designer', 'Creative', 68000],
    ['demo-employee-casey', 'Casey Williams', 'Account Executive', 'Sales', 58000],
    ['demo-employee-quinn', 'Quinn Johnson', 'Finance Controller', 'Finance', 80000],
  ] as const;

  const employeesBatch = adminDb.batch();
  for (const [id, fullName, jobTitle, department, salary] of employees) {
    employeesBatch.set(adminDb.collection('employees').doc(id), {
      id,
      tenantId,
      fullName,
      jobTitle,
      department,
      salary,
      currency: 'USD',
      status: 'active',
      startDate: daysAgo(180),
      email: `${fullName.toLowerCase().replace(' ', '.')}@nexuscreative.demo`,
      managerId: adminUser.uid,
      createdAt: daysAgo(180),
      updatedAt: now,
      isDemo: true,
    });
  }
  await employeesBatch.commit();

  const productionJobs = [
    ['demo-production-techvision', 'Website Redesign Assets', clients[0], projects[0], 'in_progress'],
    ['demo-production-bloom', 'E-commerce QA Pack', clients[1], projects[1], 'review'],
    ['demo-production-summit', 'Brand Style Guide', clients[2], projects[2], 'completed'],
  ] as const;

  const productionBatch = adminDb.batch();
  for (const [id, title, client, project, status] of productionJobs) {
    productionBatch.set(adminDb.collection('production_jobs').doc(id), {
      id,
      tenantId,
      title,
      clientId: client.id,
      clientName: client.companyName,
      projectId: project[0],
      projectName: project[1],
      status,
      assignedTo: productionUser.uid,
      assignedName: productionUser.name,
      dueDate: daysFromNow(10),
      createdAt: daysAgo(20),
      updatedAt: now,
      isDemo: true,
    });
  }
  await productionBatch.commit();

  const notifications = [
    ['demo-notification-admin', adminUser.uid, 'Invoice overdue', 'INV-0003 is overdue.', 'invoice'],
    ['demo-notification-sales', salesUser.uid, 'New lead assigned', 'Apex Digital is assigned to you.', 'lead'],
    ['demo-notification-finance', financeUser.uid, 'Invoice review', 'INV-0004 needs attention.', 'invoice'],
    ['demo-notification-client', clientUser.uid, 'Project kickoff', 'TechVision Brand Refresh is active.', 'project'],
  ] as const;

  const notificationsBatch = adminDb.batch();
  for (const [id, userId, title, body, type] of notifications) {
    notificationsBatch.set(adminDb.collection('notifications').doc(id), {
      id,
      tenantId,
      userId,
      toUserId: userId,
      title,
      body,
      message: body,
      type,
      read: false,
      isRead: false,
      createdAt: daysAgo(1),
      isDemo: true,
    });
  }
  await notificationsBatch.commit();

  await adminDb.collection('auditLogs').doc('demo-audit-seeded').set({
    tenantId,
    actorUserId: 'system',
    actorName: 'Demo Seeder',
    actorRole: 'super_admin',
    actionType: 'demo.seeded',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: { seededAt: now },
    createdAt: now,
    isDemo: true,
  });

  return {
    tenantId,
    users: resolvedUsers,
    counts: {
      clients: clients.length,
      leads: leads.length,
      deals: 1,
      invoices: invoices.length,
      projects: projects.length,
      productionJobs: productionJobs.length,
      employees: employees.length,
    },
  };
}

export async function seedDemoEnvironment({
  tenantId = DEMO_TENANT_ID,
  reset = false,
}: {
  tenantId?: string;
  reset?: boolean;
} = {}) {
  if (reset) await resetDemoTenantData(tenantId);
  return seedDemoTenant({ tenantId });
}
