import { EmailTemplateRecord } from "@/types/email-templates";

type RenderContext = Record<string, any>;

const BLOCK_IF_REGEX = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
const BLOCK_EACH_REGEX = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
const VAR_REGEX = /\{\{\s*([^{}\s]+)\s*\}\}/g;

function readPath(context: RenderContext, path: string) {
  const normalized = path.trim();
  if (!normalized) return "";
  if (normalized === "this") return context.this;

  const parts = normalized.split(".");
  let cursor: any = context;
  for (const part of parts) {
    if (cursor == null) return "";
    cursor = cursor[part];
  }
  return cursor ?? "";
}

function truthy(value: any) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function sanitizeHtml(html: string) {
  return html
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script>/gi, "")
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style>/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe>/gi, "");
}

function renderBlocks(template: string, context: RenderContext): string {
  let rendered = template;

  rendered = rendered.replace(BLOCK_IF_REGEX, (_m, conditionExpr, body) => {
    const conditionValue = readPath(context, conditionExpr);
    return truthy(conditionValue) ? renderBlocks(body, context) : "";
  });

  rendered = rendered.replace(BLOCK_EACH_REGEX, (_m, pathExpr, body) => {
    const collection = readPath(context, pathExpr);
    if (!Array.isArray(collection) || collection.length === 0) {
      return "";
    }
    return collection
      .map((item) => {
        const nextContext = { ...context, this: item };
        return renderBlocks(body, nextContext);
      })
      .join("");
  });

  rendered = rendered.replace(VAR_REGEX, (_m, pathExpr) => {
    const value = readPath(context, pathExpr);
    return String(value ?? "");
  });

  return rendered;
}

export function renderTemplate({
  template,
  context,
  locale,
}: {
  template: Pick<EmailTemplateRecord, "subject" | "body" | "translations" | "language">;
  context: RenderContext;
  locale?: string;
}) {
  const resolvedLocale = (locale || template.language || "en").trim();
  const localized = template.translations?.[resolvedLocale];

  const subjectSource = localized?.subject || template.subject;
  const bodySource = localized?.body || template.body;

  const renderedSubject = renderBlocks(subjectSource, context);
  const renderedHtml = sanitizeHtml(renderBlocks(bodySource, context));

  return {
    locale: resolvedLocale,
    renderedSubject,
    renderedHtml,
    renderedText: renderedHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
  };
}

export function generatePreviewPayload(context: RenderContext = {}) {
  return {
    tenant: { name: "BIZOSTO ERP" },
    company: { name: "BIZOSTO ERP", supportEmail: "support@bizosto.com" },
    date: { today: new Date().toISOString().slice(0, 10) },
    user: {
      name: "Ava Manager",
      email: "ava.manager@bizosto.test",
    },
    client: {
      name: "Global Ventures Ltd",
      email: "finance@globalventures.test",
    },
    invoice: {
      number: "INV-2026-0031",
      amount: "1250.00",
      currency: "USD",
      dueDate: "2026-02-28",
      status: "sent",
      link: "https://erp.bizosto.test/invoices/INV-2026-0031",
    },
    project: {
      name: "Website Revamp",
      status: "On Track",
      highlights: ["Homepage complete", "Checkout flow in QA", "Client review this Friday"],
    },
    task: {
      name: "Prepare release notes",
      dueDate: "2026-02-15",
      assigneeName: "Noah Engineer",
    },
    workflow: { stepName: "Manager Approval" },
    approval: {
      requestId: "LR-8821",
      status: "approved",
      comment: "Approved with coverage from operations.",
    },
    actor: { name: "Mia HR", role: "admin" },
    ...context,
  };
}
