import admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAdminOrSuper } from "@/app/api/admin/_utils";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";
import { buildTemplatePayload, emailTemplateSchema, toIso, writeTemplateVersion } from "@/lib/email/template-repository";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const templateSnap = await adminDb.collection("email_templates").doc(params.id).get();
    if (!templateSnap.exists) return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });

    const data = templateSnap.data() || {};
    const tenantId = normalizeTenantId(me.tenantId || null);
    if (normalizeTenantId(data.tenantId) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const versionsSnap = await adminDb
      .collection("email_template_versions")
      .where("templateId", "==", params.id)
      .where("tenantId", "==", tenantId)
      .orderBy("version", "desc")
      .limit(20)
      .get();

    return NextResponse.json({
      ok: true,
      template: { id: templateSnap.id, ...data, createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt) },
      versions: versionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: toIso(doc.data().createdAt) })),
    });
  } catch (error: any) {
    console.error("GET /api/email/templates/[id] error", error);
    return NextResponse.json({ ok: false, error: error?.message || "Failed to fetch template" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!isAdminOrSuper(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const ref = adminDb.collection("email_templates").doc(params.id);
    const existingSnap = await ref.get();
    if (!existingSnap.exists) return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });

    const existing = existingSnap.data() || {};
    const tenantId = normalizeTenantId(me.tenantId || null);
    if (normalizeTenantId(existing.tenantId) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = emailTemplateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const payload = buildTemplatePayload(parsed.data, me);
    const nextVersion = Number(existing.version || 0) + 1;
    await ref.set(
      {
        ...payload,
        version: nextVersion,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeTemplateVersion({
      templateId: params.id,
      category: payload.category,
      language: payload.language,
      name: payload.name,
      subject: payload.subject,
      body: payload.body,
      variables: payload.variables,
      translations: payload.translations,
      tenantId: payload.tenantId,
      version: nextVersion,
      uid: me.uid,
    });

    return NextResponse.json({ ok: true, id: params.id, version: nextVersion });
  } catch (error: any) {
    console.error("PUT /api/email/templates/[id] error", error);
    return NextResponse.json({ ok: false, error: error?.message || "Failed to update template" }, { status: 500 });
  }
}
