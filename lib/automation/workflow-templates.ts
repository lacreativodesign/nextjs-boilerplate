import type { WorkflowDefinition } from "./workflow-types";

type SeedTemplate = Omit<WorkflowDefinition, "id" | "tenantId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">;

export const WORKFLOW_TEMPLATES: Record<string, SeedTemplate> = {
  auto_approve_invoices_under_500: {
    name: "Auto-approve invoices under $500",
    description: "Approves finance invoices automatically if total is under threshold.",
    trigger: { type: "event", event: "record_created", entity: "invoices" },
    conditions: [{ id: "invoice-total", field: "amount", operator: "lte", value: 500 }],
    actions: [{ id: "approve-invoice", type: "update_field", entity: "invoices", field: "approvalStatus", value: "approved" }],
    status: "disabled",
    retryLimit: 2,
    templateKey: "auto_approve_invoices_under_500",
  },
  send_welcome_email_new_client: {
    name: "Send welcome email on new client",
    description: "Sends onboarding email whenever a new client record is created.",
    trigger: { type: "event", event: "record_created", entity: "clients" },
    conditions: [],
    actions: [
      {
        id: "welcome-email",
        type: "send_email",
        to: ["{{record.email}}"],
        subject: "Welcome to Bizosto ERP",
        body: "Hello {{record.name}}, your account is now active.",
      },
    ],
    status: "disabled",
    retryLimit: 2,
    templateKey: "send_welcome_email_new_client",
  },
  notify_manager_high_priority_task: {
    name: "Notify manager on high-priority task",
    description: "Escalates tasks marked with high priority for management visibility.",
    trigger: { type: "event", event: "field_changed", entity: "tasks", field: "priority" },
    conditions: [{ id: "priority-high", field: "priority", operator: "eq", value: "high" }],
    actions: [
      {
        id: "notify-manager",
        type: "approval",
        mode: "parallel",
        steps: [{ id: "manager-step", type: "manager" }],
      },
    ],
    status: "disabled",
    retryLimit: 1,
    templateKey: "notify_manager_high_priority_task",
  },
  auto_assign_leads_by_region: {
    name: "Auto-assign leads by region",
    description: "Assigns lead owner using regional routing map.",
    trigger: { type: "event", event: "record_created", entity: "leads" },
    conditions: [],
    actions: [{ id: "assign-owner", type: "update_field", entity: "leads", field: "ownerUid", value: "{{regionOwner}}" }],
    status: "disabled",
    retryLimit: 2,
    templateKey: "auto_assign_leads_by_region",
  },
  escalate_overdue_tasks_3_days: {
    name: "Escalate overdue tasks after 3 days",
    description: "Scheduled escalation for tasks overdue by more than 3 days.",
    trigger: { type: "scheduled", cron: "0 * * * *", timezone: "UTC" },
    conditions: [{ id: "days-overdue", field: "daysOverdue", operator: "gte", value: 3 }],
    actions: [
      {
        id: "task-escalation-webhook",
        type: "webhook",
        url: "https://example.internal/erp/escalations/tasks",
        method: "POST",
      },
    ],
    status: "disabled",
    retryLimit: 3,
    templateKey: "escalate_overdue_tasks_3_days",
  },
};
