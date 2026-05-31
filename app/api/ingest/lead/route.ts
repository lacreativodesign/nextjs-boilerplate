import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import crypto from "crypto";
import { createNotification, getUsersByRoles } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) return "unknown";
  return forwardedFor.split(",")[0]?.trim() || "unknown";
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const entry = rateLimitState.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitState.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function POST(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id")?.trim();
    const apiKey = req.headers.get("x-api-key")?.trim();

    if (!tenantId || !apiKey) {
      return NextResponse.json({ ok: false, error: "missing_auth_headers" }, { status: 401 });
    }

    const rateKey = `${tenantId}:${getClientIp(req)}`;
    const rateLimit = checkRateLimit(rateKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited" },
        {
          status: 429,
          headers: { "Retry-After": Math.ceil((rateLimit.resetAt! - Date.now()) / 1000).toString() },
        }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch (error) {
      console.error("Failed to parse lead ingest payload:", error);
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!fullName) {
      return NextResponse.json({ ok: false, error: "full_name_required" }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ ok: false, error: "message_required" }, { status: 400 });
    }

    const tenantSnap = await adminDb.doc(`tenants/${tenantId}`).get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ ok: false, error: "invalid_tenant" }, { status: 401 });
    }

    const tenantData = tenantSnap.data() || {};
    const hashedProvided = hashKey(apiKey);
    const keyValid =
      (tenantData.apiKeyHash && tenantData.apiKeyHash === hashedProvided) ||
      (!tenantData.apiKeyHash && tenantData.apiKey === apiKey);
    if (!keyValid) {
      return NextResponse.json({ ok: false, error: "invalid_api_key" }, { status: 401 });
    }

    const leadRef = adminDb.collection("leads").doc();

    const leadSource = "Website";
    const status = "New";

    const leadData = {
      tenantId,
      name: fullName,
      email,
      phone: normalizeOptionalString(body.phone),
      companyName: normalizeOptionalString(body.company),
      contactName: fullName,
      contactEmail: email,
      contactPhone: normalizeOptionalString(body.phone),
      teamSize: normalizeOptionalString(body.teamSize),
      serviceType: normalizeOptionalString(body.serviceType),
      notes: message,
      source: leadSource,
      status,
      stage: "New Lead",
      isDeleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await leadRef.set(leadData);

    const recipients = await getUsersByRoles(["admin", "sales_manager"], tenantId);
    await Promise.all(
      recipients.map((recipient) => {
        const role = String(recipient.role || "");
        const deepLink =
          role === "admin" || role === "super_admin"
            ? `/admin/sales/leads?open=${leadRef.id}`
            : `/sales_manager/leads?open=${leadRef.id}`;
        return createNotification({
          recipientUid: recipient.uid,
          recipientRole: role,
          tenantId,
          type: "new_lead",
          title: "New website lead",
          message: `${fullName} submitted a demo request`,
          entityType: "lead",
          entityId: leadRef.id,
          deepLink,
        });
      })
    );

    return NextResponse.json({ ok: true, leadId: leadRef.id }, { status: 200 });
  } catch (error) {
    console.error("Lead ingest error:", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
