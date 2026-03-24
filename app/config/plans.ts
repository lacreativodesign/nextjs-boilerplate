// Bizosto SaaS plan module access gates.
// trial      = all modules for 14-day evaluation (client_stripe_connect excluded).
// starter    = CRM, Sales, Projects, Notifications, basic Reports.
// pro        = adds Finance, Production, Approvals, full Reports.
// enterprise = adds HR, Client Stripe Connect, white-label.
export const PLAN_MODULES = {
  trial: {
    crm: true,
    sales: true,
    production: true,
    projects: true,
    approvals: true,
    notifications: true,
    finance: true,
    hr: true,
    reports: true,
    client_stripe_connect: false,
  },
  starter: {
    crm: true,
    sales: true,
    production: false,
    projects: true,
    approvals: false,
    notifications: true,
    finance: false,
    hr: false,
    reports: true,
    client_stripe_connect: false,
  },
  pro: {
    crm: true,
    sales: true,
    production: true,
    projects: true,
    approvals: true,
    notifications: true,
    finance: true,
    hr: false,
    reports: true,
    client_stripe_connect: false,
  },
  enterprise: {
    crm: true,
    sales: true,
    production: true,
    projects: true,
    approvals: true,
    notifications: true,
    finance: true,
    hr: true,
    reports: true,
    client_stripe_connect: true,
  },
};

export const PLAN_DETAILS = {
  starter: {
    label: 'Starter',
    description: 'CRM, sales pipeline and project management for small teams.',
  },
  pro: {
    label: 'Pro',
    description: 'Full operations including finance, production and reporting.',
  },
  enterprise: {
    label: 'Enterprise',
    description: 'Everything including HR, client payments and white-label.',
  },
};
