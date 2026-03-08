export const EMAIL_TEMPLATE_CATEGORIES = ["invoice", "notification", "marketing", "workflow"] as const;

export type EmailTemplateCategory = (typeof EMAIL_TEMPLATE_CATEGORIES)[number];

export type EmailTemplateTranslation = {
  subject: string;
  body: string;
};

export type EmailTemplateRecord = {
  name: string;
  key: string;
  category: EmailTemplateCategory;
  subject: string;
  body: string;
  language: string;
  translations: Record<string, EmailTemplateTranslation>;
  variables: string[];
  isActive: boolean;
  tenantId: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;
};

export type EmailTemplateVersionRecord = {
  templateId: string;
  tenantId: string;
  version: number;
  name: string;
  category: EmailTemplateCategory;
  language: string;
  subject: string;
  body: string;
  translations: Record<string, EmailTemplateTranslation>;
  variables: string[];
  updatedBy: string;
  createdAt: string | null;
};

export type EmailTemplateUsageRecord = {
  templateId: string;
  tenantId: string;
  channel: "preview" | "test_send" | "runtime";
  locale: string;
  renderedSubject: string;
  renderedHtml: string;
  recipientEmail?: string | null;
  actorUid: string;
  createdAt: string | null;
};
