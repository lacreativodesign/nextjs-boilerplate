import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../../_utils";
import { normalizeOptionalSlug, normalizeSlugArray, slugify } from "@/lib/segments";
import { queueClientActivationInvite } from "@/lib/clientActivation";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { createClientSchema } from "@/lib/validations/client";
import { validateRequest } from "@/lib/validations/validate";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

function canCreateClient(role: string) {
  const r = (role || "").toLowerCase();
  return r === "super_admin" || r === "admin" || r === "sales_manager" || r === "sales";
}

function cleanString(v: any) {
  return String(v ?? "").trim();
}

function normalizeEmail(v: string) {
  return cleanString(v).toLowerCase();
}

function toNumber(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function canonicalPaymentStatus(input: any): "Unpaid" | "Partially Paid" | "Paid" {
  const s = String(input ?? "").trim().toLowerCase();
  if (s === "paid") return "Paid";
  if (s === "partially paid" || s === "partial" || s === "partially_paid" || s === "partiallypaid") return "Partially Paid";
  return "Unpaid";
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!canCreateClient(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    await checkRateLimit(req, "standard", me.uid);

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      throw new AppError({
        message: "Invalid JSON body",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    const validatedData = validateRequest(createClientSchema, {
      companyName: body?.companyName,
      contactName: body?.primaryContactName || body?.contactName,
      email: body?.primaryContactEmail || body?.email,
      phone: body?.primaryContactPhone || body?.phone,
      address: body?.address,
      industry: body?.industry,
      website: body?.website,
      tenantId: me.tenantId || body?.tenantId || "",
    });

    const companyName = validatedData.companyName;
    const primaryContactName = validatedData.contactName;
    const primaryContactEmail = validatedData.email;
    const primaryContactPhone = validatedData.phone || "";
    const tenantId = validatedData.tenantId;
    const salesOwner = cleanString(body?.salesOwner);
    const primaryContactEmailLower = normalizeEmail(primaryContactEmail);

    if (!salesOwner) return NextResponse.json({ ok: false, error: "Sales Owner is required" }, { status: 400 });

    // Enforce 1 email per account (ignore deleted clients)
    const existingByLower = await db
      .collection("clients")
      .where("primaryContactEmailLower", "==", primaryContactEmailLower)
      .limit(1)
      .get();

    const existingByRaw = await db
      .collection("clients")
      .where("primaryContactEmail", "==", primaryContactEmail)
      .limit(1)
      .get();

    const duplicate =
      existingByLower.docs.concat(existingByRaw.docs).find((doc) => {
        const data = doc.data() || {};
        return !data.deletedAt;
      }) || null;

    if (duplicate) {
      return NextResponse.json({ ok: false, error: "Primary contact email already exists" }, { status: 400 });
    }

    // IMPORTANT: Order ID is ONLY for paid clients. So on create we DO NOT generate it.
    // Payment status defaults to Unpaid unless (optional) admin wants to create as paid via update flow.
    const paymentStatus = "Unpaid" as const;

    const now = admin.firestore.FieldValue.serverTimestamp();

    const doc = {
      // Company
      companyName,
      website: cleanString(body?.website),
      industry: cleanString(body?.industry),
      businessType: cleanString(body?.businessType),
      country: cleanString(body?.country),
      city: cleanString(body?.city),
      timezone: cleanString(body?.timezone),
      employeeCountRange: cleanString(body?.employeeCountRange) || null,
      yearsInBusinessRange: cleanString(body?.yearsInBusinessRange) || null,

      segmentServices: normalizeSlugArray(body?.segmentServices),
      segmentBusinessType: normalizeOptionalSlug(body?.segmentBusinessType),
      segmentIndustry: normalizeOptionalSlug(body?.segmentIndustry),
      segmentGeo: body?.segmentGeo !== undefined ? normalizeOptionalSlug(body?.segmentGeo) : slugify(cleanString(body?.country)) || null,

      // Contact
      primaryContactName,
      primaryContactTitle: cleanString(body?.primaryContactTitle),
      primaryContactEmail,
      primaryContactEmailLower,
      primaryContactPhone,

      // Lifecycle
      salesStage: cleanString(body?.salesStage) || "New Lead",
      paymentStatus,
      retainerStatus: cleanString(body?.retainerStatus) || "None",

      // Ownership
      salesOwner,
      accountManager: cleanString(body?.accountManager),
      productionOwner: cleanString(body?.productionOwner),

      // Finance
      totalContractValueUsd: toNumber(body?.totalContractValueUsd),
      totalPaidUsd: toNumber(body?.totalPaidUsd), // stored but status remains Unpaid until admin updates paymentStatus
      openBalanceUsd: toNumber(body?.openBalanceUsd),

      // Notes
      services: "",

      // Paid account identifier (ONLY generated when paid/partially paid)
      orderId: "",

      // Timestamps
      createdAt: now,
      updatedAt: now,
      lastActivity: now,
      tenantId,
    };

    // If someone tries to sneak Paid in create payload, ignore it.
    // (Paid must be done via update and only admin/super_admin).
    // We keep this for clarity:
    void canonicalPaymentStatus(body?.paymentStatus);

    const ref = await db.collection("clients").add(doc);

    try {
      const changes = Object.entries(doc)
        .filter(([field]) => !["createdAt", "updatedAt", "lastActivity"].includes(field))
        .map(([field, value]) => ({
          field,
          oldValue: null,
          newValue: value,
        }));
      await logEvent({
        tenantId,
        type: "client.created",
        title: "Client created",
        description: `${companyName} created.`,
        entityType: "client",
        entityId: ref.id,
        actor: { uid: me.uid, name: me.name || me.fullName || "" },
        metadata: {
          ip: getClientIp(req),
          userAgent: req.headers.get("user-agent") || "",
        },
        audit: {
          action: "create",
          resource: "customer",
          resourceId: ref.id,
          changes,
        },
      });
    } catch (auditError) {
      console.error("audit log error:", auditError);
    }

    try {
      await queueClientActivationInvite({
        clientId: ref.id,
        clientData: {
          primaryContactEmail,
          primaryContactName,
          companyName,
        },
        createdByUid: me.uid,
        reason: "client_created",
      });
    } catch (inviteError) {
      console.error("client activation invite error:", inviteError);
    }

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Failed to create client.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
