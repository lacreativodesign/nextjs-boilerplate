import admin from "firebase-admin";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";
import { getVariablesForCategory, PREBUILT_TEMPLATES } from "@/lib/email/template-catalog";
import { EMAIL_TEMPLATE_CATEGORIES, type EmailTemplateCategory } from "@/types/email-templates";

export const emailTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  key: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  category: z.enum(EMAIL_TEMPLATE_CATEGORIES),
  subject: z.string().trim().min(3).max(240),
  body: z.string().trim().min(10).max(30000),
  language: z.string().trim().min(2).max(10).default("en"),
  translations: z.record(z.object({ subject: z.string().trim().min(3).max(240), body: z.string().trim().min(10).max(30000) })).default({}),
  variables: z.array(z.string().trim().min(1)).default([]),
  isActive: z.boolean().default(true),
});

export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as Record<string, unknown>)?.toDate === "function") return (value as Record<string, unknown>).toDate().toISOString();
  return null;
}

export function buildTemplatePayload(data: z.infer<typeof emailTemplateSchema>, user: { uid: string; tenantId?: string | null }) {
  const tenantId = normalizeTenantId(user.tenantId || null);
  const mergedVars = Array.from(new Set([...getVariablesForCategory(data.category), ...data.variables])).sort();
  return {
    ...data,
    variables: mergedVars,
    tenantId,
    updatedBy: user.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

export async function writeTemplateVersion({
  templateId,
  category,
  language,
  name,
  subject,
  body,
  variables,
  translations,
  tenantId,
  version,
  uid,
}: {
  templateId: string;
  category: EmailTemplateCategory;
  language: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  translations: Record<string, { subject: string; body: string }>;
  tenantId: string;
  version: number;
  uid: string;
}) {
  await adminDb.collection("email_template_versions").add({
    templateId,
    tenantId,
    version,
    name,
    category,
    language,
    subject,
    body,
    variables,
    translations,
    updatedBy: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function ensurePrebuiltTemplates(user: { uid: string; tenantId?: string | null }) {
  const tenantId = normalizeTenantId(user.tenantId || null);
  const existing = await adminDb
    .collection("email_templates")
    .where("tenantId", "==", tenantId)
    .where("isSystem", "==", true)
    .limit(1)
    .get();

  if (!existing.empty) return;

  const batch = adminDb.batch();
  for (const seed of PREBUILT_TEMPLATES) {
    const ref = adminDb.collection("email_templates").doc();
    const variables = getVariablesForCategory(seed.category);
    batch.set(ref, {
      ...seed,
      language: "en",
      translations: {},
      variables,
      isSystem: true,
      isActive: true,
      version: 1,
      tenantId,
      createdBy: user.uid,
      updatedBy: user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}
