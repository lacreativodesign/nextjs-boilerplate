// Bizosto SaaS plan module access gates.
//
// S6: a 14-day trial is a trial OF A SELECTED PLAN — it is not an entitlement tier of
// its own. A trialing tenant carries the explicit `modules` map of the plan it signed
// up for, and that map governs. The `trial` entry below is ONLY the fallback used when
// a tenant document has no explicit module map, so it must grant the LEAST privilege,
// never the most. It previously granted every paid module (Finance, HR, Production,
// Approvals), which meant any tenant with a missing or malformed module map silently
// received Enterprise-level access for free.
//
// trial      = fallback only; mirrors Starter. Never grants a paid module.
// starter    = CRM, Sales, Projects, Notifications, basic Reports.
// pro        = adds Finance, Production, Approvals, full Reports.
// enterprise = adds HR, Client Stripe Connect, white-label.
export const PLAN_MODULES = {
  trial: {
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
