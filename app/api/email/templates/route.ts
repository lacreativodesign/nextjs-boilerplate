import admin from "firebase-admin";
import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAdminOrSuper } from "@/app/api/admin/_utils";
import {
  buildTemplatePayload,
  emailTemplateSchema,
  ensurePrebuiltTemplates,
  toIso,
  writeTemplateVersion,
} from "@/lib/email/template-repository";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!isAdminOrSuper(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const parsed = emailTemplateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const payload = buildTemplatePayload(parsed.data, me);
    const ref = adminDb.collection("email_templates").doc();
    await ref.set({
      ...payload,
      createdBy: me.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      version: 1,
    });

    await writeTemplateVersion({
      templateId: ref.id,
      category: payload.category,
      language: payload.language,
      name: payload.name,
      subject: payload.subject,
      body: payload.body,
      variables: payload.variables,
      translations: payload.translations,
      tenantId: payload.tenantId,
      version: 1,
      uid: me.uid,
    });

    return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/email/templates error", error);
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Failed to create template" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    await ensurePrebuiltTemplates(me);

    const tenantId = normalizeTenantId(me.tenantId || null);
    const category = request.nextUrl.searchParams.get("category");

    let query: FirebaseFirestore.Query = adminDb.collection("email_templates").where("tenantId", "==", tenantId);
    if (category) query = query.where("category", "==", category);

    const snap = await query.orderBy("updatedAt", "desc").get();
    const templates = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        ...data,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    console.error("GET /api/email/templates error", error);
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Failed to list templates" }, { status: 500 });
  }
}
