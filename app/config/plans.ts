export const PLAN_MODULES = {
  starter: {
    crm: true,
    projects: true,
    approvals: false,
    notifications: false,
    finance: false,
    hr: false,
    reports: false,
  },
  pro: {
    crm: true,
    projects: true,
    approvals: true,
    notifications: true,
    finance: true,
    hr: false,
    reports: true,
  },
  enterprise: {
    crm: true,
    projects: true,
    approvals: true,
    notifications: true,
    finance: true,
    hr: true,
    reports: true,
  },
};
