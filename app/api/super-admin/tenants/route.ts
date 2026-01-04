import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "@/app/api/super-admin/_utils";
import { DEFAULT_MODULES, DEFAULT_TENANT_BRAND } from "@/lib/tenant/constants";
import { writeAuditLog } from "@/lib/tenant/audit";
import { queueEmailEvent } from "@/lib/emailEvents";

export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const snap = await adminDb.collection("tenants").orderBy("createdAt", "desc").get();
    const tenants = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        name: data.name || "",
        slug: data.slug || "",
        status: data.status || "active",
        brand: data.brand || null,
        modulesEnabled: data.modulesEnabled || DEFAULT_MODULES,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
      };
    });

    return NextResponse.json({ ok: true, tenants });
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin(req);
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const slugInput = String(body?.slug || "").trim();
    const createAdminEmail = String(body?.createAdminEmail || "").trim().toLowerCase();
    const modulesEnabled = body?.modulesEnabled || DEFAULT_MODULES;

    if (!name) {
      return NextResponse.json({ ok: false, error: "Tenant name is required" }, { status: 400 });
    }

    const slug = slugify(slugInput || name);
    const tenantRef = adminDb.collection("tenants").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const payload = {
      name,
      slug,
      status: "active",
      brand: {
        ...DEFAULT_TENANT_BRAND,
        name,
      },
      modulesEnabled: {
        ...DEFAULT_MODULES,
        ...modulesEnabled,
      },
      createdAt: now,
      updatedAt: now,
      updatedBy: user.uid,
    };

    await tenantRef.set(payload);

    let createdUserId: string | null = null;
    if (createAdminEmail) {
      const authUser = await adminAuth.createUser({
        email: createAdminEmail,
        displayName: createAdminEmail.split("@")[0],
      });
      createdUserId = authUser.uid;
      await adminDb.collection("users").doc(authUser.uid).set(
        {
          email: createAdminEmail,
          displayName: createAdminEmail.split("@")[0],
          role: "admin",
          tenantId: tenantRef.id,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      await queueEmailEvent({
        templateId: "account_activation",
        to: createAdminEmail,
        data: {
          tenantId: tenantRef.id,
          tenantName: name,
          role: "admin",
        },
        metadata: {
          source: "super_admin_tenant_create",
        },
      });
    }

    await writeAuditLog({
      tenantId: null,
      actorUserId: user.uid,
      actionType: "tenant_created",
      entityType: "tenant",
      entityId: tenantRef.id,
      metadata: { name, slug, createdUserId },
    });

    return NextResponse.json({ ok: true, tenantId: tenantRef.id, createdUserId });
  } catch (err: any) {
    const message = err?.message || "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
