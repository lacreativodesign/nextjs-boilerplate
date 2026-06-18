import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotifications, getUsersByRoles } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import { authenticateIngest } from "@/lib/ingest/auth";
import { queueClientActivationInvite } from "@/lib/clientActivation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_TYPES = ["Website", "Branding", "SEO", "Social", "Video", "Other"];

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toNumber(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

// Match a client by email within the tenant, mirroring app/api/client/_utils.ts.
// Uses the existing (tenantId + primaryContactEmailLower / primaryContactEmail) indexes.
async function findClientByEmail(
  tenantId: string,
  emailLower: string,
  emailRaw: string,
): Promise<{ id: string; data: FirebaseFirestore.DocumentData } | null> {
  const byLower = await adminDb
    .collection("clients")
    .where("tenantId", "==", tenantId)
    .where("primaryContactEmailLower", "==", emailLower)
    .limit(1)
    .get();
  let candidate = byLower.empty ? null : byLower.docs[0];
  if (!candidate) {
    const byRaw = await adminDb
      .collection("clients")
      .where("tenantId", "==", tenantId)
      .where("primaryContactEmail", "==", emailRaw)
      .limit(1)
      .get();
    candidate = byRaw.empty ? null : byRaw.docs[0];
  }
  if (!candidate) return null;
  const data = candidate.data() || {};
  if (data.deletedAt) return null;
  return { id: candidate.id, data };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, any> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
    }

    const auth = await authenticateIngest(req, {
      fallbackApiKey: normalizeOptionalString(body.apiKey),
      fallbackTenantId: normalizeOptionalString(body.tenantId),
      allowGlobalKeyFallback: true,
    });
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: "Invalid credentials." }, { status: auth.status });
    }
    const tenantId = auth.tenantId;

    const stripeSessionId = normalizeOptionalString(body.stripeSessionId);
    const customerEmailRaw = normalizeOptionalString(body.customerEmail);
    const customerEmail = customerEmailRaw ? customerEmailRaw.toLowerCase() : "";

    if (!stripeSessionId) {
      return NextResponse.json({ ok: false, error: "stripeSessionId is required." }, { status: 400 });
    }
    if (!customerEmail || !isValidEmail(customerEmail)) {
      return NextResponse.json({ ok: false, error: "Valid customerEmail is required." }, { status: 400 });
    }

    // Idempotency anchor: one order per (tenant, stripe session id).
    const orderKey = `${tenantId}_${stripeSessionId}`.replace(/[^A-Za-z0-9_-]/g, "_");
    const orderRef = adminDb.collection("orders").doc(orderKey);
    const existingOrder = await orderRef.get();
    if (existingOrder.exists) {
      const d = existingOrder.data() || {};
      return NextResponse.json(
        { ok: true, duplicate: true, orderId: orderRef.id, clientId: d.clientId ?? null, projectId: d.projectId ?? null },
        { status: 200 },
      );
    }

    const customerName = normalizeOptionalString(body.customerName);
    const companyName = normalizeOptionalString(body.companyName) || customerName || customerEmail;
    const packageName = normalizeOptionalString(body.packageName);
    const amountTotal = toNumber(body.amountTotal);
    const currency = (normalizeOptionalString(body.currency) || "usd").toLowerCase();
    const stripeSubscriptionId = normalizeOptionalString(body.subscriptionId);
    const stripeCustomerId = normalizeOptionalString(body.stripeCustomerId);
    const isRecurring = Boolean(stripeSubscriptionId);

    const requestedType = normalizeOptionalString(body.projectType);
    const projectType = requestedType && PROJECT_TYPES.includes(requestedType) ? requestedType : "Other";

    const now = admin.firestore.FieldValue.serverTimestamp();
    const nowIso = new Date().toISOString();

    // 1) Upsert client (match by email within tenant; create if missing).
    let clientId: string;
    let clientName: string;
    let createdNewClient = false;
    const existingClient = await findClientByEmail(tenantId, customerEmail, customerEmailRaw || customerEmail);

    if (existingClient) {
      clientId = existingClient.id;
      clientName = String(existingClient.data.companyName || existingClient.data.name || companyName);
      if (isRecurring || stripeCustomerId) {
        await adminDb.collection("clients").doc(clientId).set(
          {
            stripeCustomerId: stripeCustomerId || existingClient.data.stripeCustomerId || null,
            stripeSubscriptionId: stripeSubscriptionId || existingClient.data.stripeSubscriptionId || null,
            subscriptionStatus: isRecurring ? "active" : existingClient.data.subscriptionStatus || null,
            updatedAt: now,
          },
          { merge: true },
        );
      }
    } else {
      const clientRef = adminDb.collection("clients").doc();
      await clientRef.set({
        companyName,
        website: normalizeOptionalString(body.website) || "",
        industry: "",
        businessType: "",
        country: "",
        city: "",
        timezone: "",
        employeeCountRange: null,
        yearsInBusinessRange: null,
        segmentServices: [] as string[],
        segmentBusinessType: null,
        segmentIndustry: null,
        segmentGeo: null,
        primaryContactName: customerName || companyName,
        primaryContactTitle: "",
        primaryContactEmail: customerEmail,
        primaryContactEmailLower: customerEmail,
        primaryContactPhone: normalizeOptionalString(body.customerPhone) || "",
        salesStage: "Won",
        paymentStatus: "Paid" as const,
        retainerStatus: isRecurring ? "Active" : "None",
        salesOwner: "",
        accountManager: "",
        productionOwner: "",
        totalContractValueUsd: amountTotal,
        totalPaidUsd: amountTotal,
        openBalanceUsd: 0,
        services: "",
        orderId: "",
        source: "website",
        stripeCustomerId: stripeCustomerId || null,
        stripeSubscriptionId: stripeSubscriptionId || null,
        subscriptionStatus: isRecurring ? "active" : null,
        createdAt: now,
        updatedAt: now,
        lastActivity: now,
        tenantId,
      });
      clientId = clientRef.id;
      clientName = companyName;
      createdNewClient = true;

      try {
        await queueClientActivationInvite({
          clientId,
          clientData: {
            primaryContactEmail: customerEmail,
            primaryContactName: customerName || companyName,
            companyName,
          },
          createdByUid: null,
          reason: "online_purchase",
        });
      } catch (inviteError) {
        console.error("orders ingest: client activation invite error:", inviteError);
      }
    }

    // 2) Create the project (tenant-stamped so it appears in project lists).
    const projectRef = adminDb.collection("projects").doc();
    const projectName = normalizeOptionalString(body.projectName) || packageName || `${projectType} project`;
    await projectRef.set({
      projectName,
      clientId,
      clientName,
      projectType,
      stage: "Kickoff",
      priority: "Normal",
      health: null,
      createdByUid: null,
      createdByName: "Online Purchase",
      ownerAmUid: null,
      ownerAmName: null,
      productionUid: null,
      productionName: null,
      startDate: nowIso,
      dueDate: null,
      totalPaidUsd: amountTotal,
      outstandingUsd: 0,
      internalNotes: "",
      source: "website",
      isDeleted: false,
      tenantId,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
    });
    const projectId = projectRef.id;

    // 3) Write the order record (idempotency anchor) with full linkage.
    await orderRef.set({
      tenantId,
      orderId: orderRef.id,
      stripeSessionId,
      stripeSubscriptionId: stripeSubscriptionId || null,
      stripeCustomerId: stripeCustomerId || null,
      mode: isRecurring ? "subscription" : "payment",
      amountTotal,
      currency,
      packageName: packageName || null,
      customerEmail,
      customerName: customerName || null,
      clientId,
      projectId,
      status: "completed",
      source: "website",
      createdAt: now,
      updatedAt: now,
    });

    // 4) Notify + audit.
    const recipients = await getUsersByRoles(
      ["admin", "super_admin", "sales_manager", "production_manager"],
      tenantId,
    );
    await createNotifications({
      recipients,
      tenantId,
      type: "deal_paid",
      title: "New online order",
      message: `${clientName} purchased ${packageName || projectType} (${currency.toUpperCase()} ${amountTotal}).`,
      entityType: "client",
      entityId: clientId,
      deepLink: "/admin/clients",
    });

    await logEvent({
      tenantId,
      type: "order.ingested",
      title: "Online order ingested",
      description: `${clientName} purchased ${packageName || projectType} for ${currency.toUpperCase()} ${amountTotal}.`,
      entityType: "client",
      entityId: clientId,
    });

    return NextResponse.json(
      { ok: true, orderId: orderRef.id, clientId, projectId, createdClient: createdNewClient, recurring: isRecurring },
      { status: 200 },
    );
  } catch (error) {
    console.error("Order ingest error:", error);
    return NextResponse.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}
