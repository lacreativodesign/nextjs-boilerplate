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
import { dispatchWebhookEvent } from "@/lib/webhooks/webhook-delivery";
import { sendEmail } from "@/lib/email/email-service";
import { createNotifications, getUsersByRoles } from "@/lib/notifications";

export const dynamic = "force-dynamic";

function canCreateClient(role: string) {
  const r = (role || "").toLowerCase();
  return r === "super_admin" || r === "admin" || r === "sales_manager" || r === "sales";
}

function cleanString(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeEmail(v: string) {
  return cleanString(v).toLowerCase();
}

function toNumber(v: unknown) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function canonicalPaymentStatus(input: unknown): "Unpaid" | "Partially Paid" | "Paid" {
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

    let body: unknown = null;
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
      companyName: (body as Record<string, unknown>)?.companyName,
      contactName: (body as Record<string, unknown>)?.primaryContactName || (body as Record<string, unknown>)?.contactName,
      email: (body as Record<string, unknown>)?.primaryContactEmail || (body as Record<string, unknown>)?.email,
      phone: (body as Record<string, unknown>)?.primaryContactPhone || (body as Record<string, unknown>)?.phone,
      address: (body as Record<string, unknown>)?.address,
      industry: (body as Record<string, unknown>)?.industry,
      website: (body as Record<string, unknown>)?.website,
      tenantId: me.tenantId || (body as Record<string, unknown>)?.tenantId || "",
    });

    const companyName = validatedData.companyName;
    const primaryContactName = validatedData.contactName;
    const primaryContactEmail = validatedData.email;
    const primaryContactPhone = validatedData.phone || "";
    const tenantId = validatedData.tenantId;
    const salesOwner = cleanString((body as Record<string, unknown>)?.salesOwner);
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
      website: cleanString((body as Record<string, unknown>)?.website),
      industry: cleanString((body as Record<string, unknown>)?.industry),
      businessType: cleanString((body as Record<string, unknown>)?.businessType),
      country: cleanString((body as Record<string, unknown>)?.country),
      city: cleanString((body as Record<string, unknown>)?.city),
      timezone: cleanString((body as Record<string, unknown>)?.timezone),
      employeeCountRange: cleanString((body as Record<string, unknown>)?.employeeCountRange) || null,
      yearsInBusinessRange: cleanString((body as Record<string, unknown>)?.yearsInBusinessRange) || null,

      segmentServices: normalizeSlugArray((body as Record<string, unknown>)?.segmentServices),
      segmentBusinessType: normalizeOptionalSlug((body as Record<string, unknown>)?.segmentBusinessType),
      segmentIndustry: normalizeOptionalSlug((body as Record<string, unknown>)?.segmentIndustry),
      segmentGeo: (body as Record<string, unknown>)?.segmentGeo !== undefined ? normalizeOptionalSlug((body as Record<string, unknown>)?.segmentGeo) : slugify(cleanString((body as Record<string, unknown>)?.country)) || null,

      // Contact
      primaryContactName,
      primaryContactTitle: cleanString((body as Record<string, unknown>)?.primaryContactTitle),
      primaryContactEmail,
      primaryContactEmailLower,
      primaryContactPhone,

      // Lifecycle
      salesStage: cleanString((body as Record<string, unknown>)?.salesStage) || "New Lead",
      paymentStatus,
      retainerStatus: cleanString((body as Record<string, unknown>)?.retainerStatus) || "None",

      // Ownership
      salesOwner,
      accountManager: cleanString((body as Record<string, unknown>)?.accountManager),
      productionOwner: cleanString((body as Record<string, unknown>)?.productionOwner),

      // Finance
      totalContractValueUsd: toNumber((body as Record<string, unknown>)?.totalContractValueUsd),
      totalPaidUsd: toNumber((body as Record<string, unknown>)?.totalPaidUsd), // stored but status remains Unpaid until admin updates paymentStatus
      openBalanceUsd: toNumber((body as Record<string, unknown>)?.openBalanceUsd),

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
    void canonicalPaymentStatus((body as Record<string, unknown>)?.paymentStatus);

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

    try {
      await dispatchWebhookEvent({
        tenantId,
        event: "client.created",
        entityType: "client",
        entityId: ref.id,
        payload: {
          clientId: ref.id,
          companyName,
          primaryContactName,
          primaryContactEmail,
          salesOwner,
        },
        actor: { uid: me.uid, email: me.email || null, role: me.role || null },
      });
    } catch (webhookError) {
      console.error("client.created webhook dispatch error:", webhookError);
    }

    // Notify admins of new client — non-blocking
    getUsersByRoles(['admin'], tenantId).then(async (admins) => {
      await createNotifications({
        recipients: admins,
        tenantId,
        type: 'info',
        title: 'New client added',
        body: `${companyName} has been added as a client.`,
        deepLink: '/clients',
        entityType: 'lead',
      });
      return Promise.all(admins.map((admin) =>
        sendEmail({
          to: admin.email as unknown || '',
          subject: `🤝 New client added — ${companyName}`,
          html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Client Update</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#012167;">🤝 New Client Added</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">A new client has been created in your workspace.</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Company</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${companyName}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Contact</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${primaryContactName || 'Not set'}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Email</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${primaryContactEmail || 'Not set'}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Added by</td><td style="font-weight:600;color:#1E293B;text-align:right;">${me.name || me.fullName || me.email || 'Admin'}</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/admin/clients" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Clients →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto ERP · <a href="https://bizosto.com" style="color:#012167;text-decoration:none;">bizosto.com</a></p></td></tr>
</table></td></tr></table></body></html>`,
        }).catch(() => {})
      ));
    }).catch((err) => console.error('[CLIENT_CREATE] Failed to notify admins', err));

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Failed to create client.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
