// SaaS plan catalog (extend with new plans or modules as Bizosto grows).
export const PLAN_MODULES = {
  starter: {
    crm: true,
    sales: true,
    production: true,
    projects: true,
    approvals: false,
    notifications: false,
    finance: false,
    hr: false,
    reports: false,
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
    label: "Starter",
    description: "Core CRM + project management for growing teams.",
  },
  pro: {
    label: "Pro",
    description: "Full operations suite with finance and reporting.",
  },
  enterprise: {
    label: "Enterprise",
    description: "All modules unlocked with HR and advanced governance.",
  },
};
