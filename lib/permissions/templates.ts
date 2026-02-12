import type { PermissionTemplate } from "@/lib/permissions/types";

export const PERMISSION_TEMPLATES: PermissionTemplate[] = [
  {
    key: "sales_representative",
    name: "Sales Representative",
    description: "Leads, deals, clients access without delete permissions.",
    permissions: [
      { module: "sales", entity: "leads", actions: ["create", "read", "update", "export"] },
      { module: "sales", entity: "deals", actions: ["create", "read", "update", "export"] },
      {
        module: "sales",
        entity: "clients",
        actions: ["read", "update", "export"],
        fields: { email: "read", creditLimit: "hidden", internalNotes: "hidden" },
      },
    ],
  },
  {
    key: "accountant",
    name: "Accountant",
    description: "Finance full access and read-only for non-finance modules.",
    permissions: [
      { module: "finance", entity: "invoices", actions: ["create", "read", "update", "delete", "export"] },
      { module: "finance", entity: "payments", actions: ["create", "read", "update", "delete", "export"] },
      { module: "finance", entity: "tax_rates", actions: ["create", "read", "update", "delete", "export"] },
      { module: "sales", entity: "*", actions: ["read"] },
      { module: "projects", entity: "*", actions: ["read"] },
      { module: "hr", entity: "*", actions: ["read"] },
    ],
  },
  {
    key: "project_manager",
    name: "Project Manager",
    description: "Full project/task access with finance read visibility.",
    permissions: [
      { module: "projects", entity: "projects", actions: ["create", "read", "update", "delete", "export"] },
      { module: "projects", entity: "tasks", actions: ["create", "read", "update", "delete", "export"] },
      { module: "finance", entity: "*", actions: ["read"] },
    ],
  },
  {
    key: "hr_manager",
    name: "HR Manager",
    description: "HR full control with limited read access to other modules.",
    permissions: [
      { module: "hr", entity: "employees", actions: ["create", "read", "update", "delete", "export"] },
      { module: "hr", entity: "leave", actions: ["create", "read", "update", "delete", "export"] },
      { module: "hr", entity: "payroll", actions: ["create", "read", "update", "delete", "export"] },
      { module: "sales", entity: "*", actions: ["read"] },
      { module: "projects", entity: "*", actions: ["read"] },
      { module: "finance", entity: "*", actions: ["read"] },
    ],
  },
  {
    key: "client_user",
    name: "Client User",
    description: "Own projects only, no administrative or finance write access.",
    permissions: [
      { module: "projects", entity: "projects", actions: ["read"], ownOnly: true, fields: { margin: "hidden", cost: "hidden" } },
      { module: "projects", entity: "tasks", actions: ["read"], ownOnly: true },
      { module: "documents", entity: "files", actions: ["read", "export"], ownOnly: true },
    ],
  },
];

export function getPermissionTemplateByKey(key: string) {
  return PERMISSION_TEMPLATES.find((template) => template.key === key) || null;
}
