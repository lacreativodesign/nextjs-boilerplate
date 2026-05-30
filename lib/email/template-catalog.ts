import type { EmailTemplateCategory } from "@/types/email-templates";

export const EMAIL_TEMPLATE_VARIABLES: Record<string, string[]> = {
  common: [
    "tenant.name",
    "user.name",
    "user.email",
    "date.today",
    "company.name",
    "support.email",
  ],
  invoice: [
    "client.name",
    "client.email",
    "invoice.number",
    "invoice.amount",
    "invoice.currency",
    "invoice.dueDate",
    "invoice.status",
    "invoice.link",
  ],
  notification: ["project.name", "project.status", "task.name", "task.dueDate", "task.assigneeName", "workflow.stepName"],
  marketing: ["campaign.name", "campaign.ctaLink", "lead.source", "lead.score"],
  workflow: ["approval.requestId", "approval.status", "approval.comment", "actor.name", "actor.role"],
};

export function getVariablesForCategory(category: EmailTemplateCategory) {
  const fromCategory = EMAIL_TEMPLATE_VARIABLES[category] || [];
  return [...EMAIL_TEMPLATE_VARIABLES.common, ...fromCategory];
}

export const PREBUILT_TEMPLATES: Array<{
  key: string;
  name: string;
  category: EmailTemplateCategory;
  subject: string;
  body: string;
}> = [
  {
    key: "invoice-sent-notification",
    name: "Invoice sent notification",
    category: "invoice",
    subject: "Invoice {{invoice.number}} has been sent",
    body: "<p>Hello {{client.name}},</p><p>Your invoice <strong>{{invoice.number}}</strong> for {{invoice.amount}} {{invoice.currency}} has been issued and is due on {{invoice.dueDate}}.</p><p><a href=\"{{invoice.link}}\">View Invoice</a></p>",
  },
  {
    key: "payment-received-thank-you",
    name: "Payment received thank you",
    category: "invoice",
    subject: "Payment received for invoice {{invoice.number}}",
    body: "<p>Hi {{client.name}},</p><p>We received your payment of {{invoice.amount}} {{invoice.currency}}. Thank you.</p>",
  },
  {
    key: "project-status-update",
    name: "Project status update",
    category: "notification",
    subject: "Project {{project.name}} status update: {{project.status}}",
    body: "<p>Hello {{client.name}},</p><p>Project <strong>{{project.name}}</strong> is now <strong>{{project.status}}</strong>.</p>",
  },
  {
    key: "task-assignment-notification",
    name: "Task assignment notification",
    category: "workflow",
    subject: "New task assigned: {{task.name}}",
    body: "<p>Hi {{task.assigneeName}},</p><p>You have been assigned task <strong>{{task.name}}</strong> due on {{task.dueDate}}.</p>",
  },
  {
    key: "leave-request-decision",
    name: "Leave request approval/rejection",
    category: "workflow",
    subject: "Leave request {{approval.requestId}} is {{approval.status}}",
    body: "<p>Hello {{user.name}},</p><p>Your leave request was {{approval.status}}.</p>{{#if approval.comment}}<p>Comment: {{approval.comment}}</p>{{/if}}",
  },
  {
    key: "new-client-welcome",
    name: "Welcome email for new clients",
    category: "marketing",
    subject: "Welcome to {{company.name}}",
    body: "<p>Hello {{client.name}},</p><p>Welcome to {{company.name}}. Your account manager is {{user.name}}.</p>",
  },
  {
    key: "password-reset",
    name: "Password reset",
    category: "notification",
    subject: "Reset your password",
    body: "<p>Hello {{user.name}},</p><p>Use the secure link to reset your password.</p>",
  },
  {
    key: "weekly-project-summary",
    name: "Weekly project summary",
    category: "notification",
    subject: "Weekly summary for {{project.name}}",
    body: "<p>Hello {{client.name}},</p><p>Here is your weekly summary.</p><ul>{{#each project.highlights}}<li>{{this}}</li>{{/each}}</ul>",
  },
];
