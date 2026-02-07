import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotifications, getUsersByRoles } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import { NEXT_PUBLIC_ERP_INGEST_KEY } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEDUPE_WINDOW_MS = 60_000;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function queryWithTenant(query: FirebaseFirestore.Query, tenantId: string) {
  const queries = [query.where("tenantId", "==", tenantId)];
  if (tenantId === DEFAULT_TENANT_ID) {
    queries.push(query.where("tenantId", "==", null));
  }
  const snapshots = await Promise.all(queries.map((q) => q.get()));
  const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      if (docTenantId(doc.data()) === tenantId) {
        map.set(doc.id, doc);
      }
    });
  });
  return Array.from(map.values());
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, any> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
    }

    const rawTenantId = normalizeOptionalString(body.tenantId);
    const tenantId = normalizeTenantId(rawTenantId || DEFAULT_TENANT_ID);
    const apiKey = normalizeOptionalString(body.apiKey);

    if (!apiKey || apiKey !== String(NEXT_PUBLIC_ERP_INGEST_KEY || "")) {
      return NextResponse.json({ ok: false, error: "Invalid apiKey." }, { status: 401 });
    }

    const lead = (body.lead || {}) as Record<string, any>;
    const name = normalizeOptionalString(lead.name) || "";
    const email = normalizeOptionalString(lead.email) || "";
    const source = normalizeOptionalString(lead.source) || "website";

    if (!name) {
      return NextResponse.json({ ok: false, error: "Lead name required." }, { status: 400 });
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Valid email required." }, { status: 400 });
    }

    const now = new Date();
    const dedupeDocs = await queryWithTenant(
      adminDb
        .collection("leads")
        .where("email", "==", email)
        .where("source", "==", source)
        .orderBy("createdAt", "desc")
        .limit(5),
      tenantId
    );

    const duplicate = dedupeDocs.find((doc) => {
      const createdAt = doc.data()?.createdAt;
      if (!createdAt) return false;
      const createdDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
      return Math.abs(now.getTime() - createdDate.getTime()) < DEDUPE_WINDOW_MS;
    });

    if (duplicate) {
      return NextResponse.json({ ok: false, error: "Duplicate lead detected." }, { status: 409 });
    }

    const leadRef = adminDb.collection("leads").doc();
    const leadData = {
      tenantId,
      leadId: leadRef.id,
      source: source as "website" | "manual" | "import",
      name,
      email,
      phone: normalizeOptionalString(lead.phone),
      company: normalizeOptionalString(lead.company),
      message: normalizeOptionalString(lead.message),
      pageUrl: normalizeOptionalString(lead.pageUrl),
      utm: lead.utm || null,
      status: "new",
      ownerUid: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await leadRef.set(leadData);

    const recipients = await getUsersByRoles(["admin", "super_admin", "sales_manager"], tenantId);
    await createNotifications({
      recipients,
      tenantId,
      type: "new_lead",
      title: "New lead ingested",
      message: `${name} submitted a new lead from ${source}.`,
      entityType: "lead",
      entityId: leadRef.id,
      deepLink: `/sales_manager/leads?open=${leadRef.id}`,
    });

    await logEvent({
      tenantId,
      type: "lead.ingested",
      title: "Lead ingested",
      description: `${name} ingested from ${source}.`,
      entityType: "lead",
      entityId: leadRef.id,
    });

    return NextResponse.json({ ok: true, leadId: leadRef.id }, { status: 200 });
  } catch (error) {
    console.error("Lead ingest error:", error);
    return NextResponse.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}
