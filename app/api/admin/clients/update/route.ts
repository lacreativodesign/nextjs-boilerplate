import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { createClientInvite } from "@/lib/clientInvites";
import { createProjectFromDeal } from "@/lib/projects";
import { generateNextOrderId } from "@/lib/orderIds";
import { logEvent } from "@/lib/audit";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import { createNotification, createNotifications, getUserIdsByRoles, getUsersByRoles } from "@/lib/notifications";
import { getCurrentUser } from "../../_utils";
import { normalizeOptionalSlug, normalizeSlugArray, slugify } from "@/lib/segments";
import { assertPermission, Permission } from "../../../../lib/permissions";
import { getClientIp } from "@/lib/security";
import { dispatchWebhookEvent } from "@/lib/webhooks/webhook-delivery";

export const dynamic = "force-dynamic";

function canEditClient(role: string) {
  const r = (role || "").toLowerCase();
  return r === "super_admin" || r === "admin" || r === "sales_manager";
}

function canMarkPaid(role: string) {
  const r = (role || "").toLowerCase();
  return r === "super_admin" || r === "admin";
}

function cleanString(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeEmail(v: unknown) {
  return cleanString(v).toLowerCase();
}

function toNumber(v: unknown) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function canonicalPaymentStatus(input: unknown): "Unpaid" | "Partially Paid" | "Paid" | null {
  if (input === undefined || input === null) return null;
  const s = String(input ?? "").trim().toLowerCase();
  if (s === "paid") return "Paid";
  if (s === "partially paid" || s === "partial" || s === "partially_paid" || s === "partiallypaid") return "Partially Paid";
  if (s === "unpaid") return "Unpaid";
  return null; // ignore unknown
}

function isPaidLike(v: string | undefined | null) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "paid" || s === "partially paid" || s === "partial" || s === "partially_paid" || s === "partiallypaid";
}

function normalizeExistingStatus(v: unknown): "Unpaid" | "Partially Paid" | "Paid" {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "paid") return "Paid";
  if (s === "partially paid" || s === "partial" || s === "partially_paid" || s === "partiallypaid") return "Partially Paid";
  return "Unpaid";
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

async function handleUpdate(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canEditClient(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  try {
    assertPermission(me.role, Permission.EditClients);
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const rawTenantId = String(me.tenantId || "").trim();
  if (!rawTenantId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const tenantId = normalizeTenantId(rawTenantId);

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const id = cleanString((body as Record<string, unknown>)?.id || (body as Record<string, unknown>)?.clientId);
  if (!id) return NextResponse.json({ ok: false, error: "Client id is required" }, { status: 400 });

  try {
    const ref = db.collection("clients").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });

    const existing = (snap.data() || {}) as unknown;
    if (docTenantId(existing) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if ((existing as Record<string, unknown>)?.deletedAt) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });

    const existingPayment = normalizeExistingStatus((existing as Record<string, unknown>)?.paymentStatus);
    const existingOrderId = cleanString((existing as Record<string, unknown>)?.orderId);
    const existingEmail = cleanString((existing as Record<string, unknown>)?.primaryContactEmail);
    const existingEmailLower = normalizeEmail((existing as Record<string, unknown>)?.primaryContactEmail);

    const requestedPayment = canonicalPaymentStatus((body as Record<string, unknown>)?.paymentStatus); // null if not included
    const wantsPaidLike = requestedPayment ? isPaidLike(requestedPayment) : false;
    const wasPaidLike = isPaidLike(existingPayment);

    // Primary email is immutable to preserve 1 email per account
    const incomingEmail = cleanString((body as Record<string, unknown>)?.primaryContactEmail);
    if (incomingEmail && incomingEmail.toLowerCase() !== existingEmailLower) {
      return NextResponse.json({ ok: false, error: "Primary contact email cannot be changed" }, { status: 400 });
    }

    // If they are trying to set paid/partial, only admin/super_admin can do it.
    if (requestedPayment && wantsPaidLike && !canMarkPaid(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden: only Admin can mark paid" }, { status: 403 });
    }

    // Build safe update payload (only known fields)
    const updateData: unknown = {};

    // Company
    if ((body as Record<string, unknown>)?.companyName !== undefined) (updateData as Record<string, unknown>).companyName = cleanString((body as Record<string, unknown>).companyName);
    if ((body as Record<string, unknown>)?.website !== undefined) (updateData as Record<string, unknown>).website = cleanString((body as Record<string, unknown>).website);
    if ((body as Record<string, unknown>)?.industry !== undefined) (updateData as Record<string, unknown>).industry = cleanString((body as Record<string, unknown>).industry);
    if ((body as Record<string, unknown>)?.businessType !== undefined) (updateData as Record<string, unknown>).businessType = cleanString((body as Record<string, unknown>).businessType);
    if ((body as Record<string, unknown>)?.country !== undefined) (updateData as Record<string, unknown>).country = cleanString((body as Record<string, unknown>).country);
    if ((body as Record<string, unknown>)?.city !== undefined) (updateData as Record<string, unknown>).city = cleanString((body as Record<string, unknown>).city);
    if ((body as Record<string, unknown>)?.timezone !== undefined) (updateData as Record<string, unknown>).timezone = cleanString((body as Record<string, unknown>).timezone);
    if ((body as Record<string, unknown>)?.employeeCountRange !== undefined) {
      (updateData as Record<string, unknown>).employeeCountRange = cleanString((body as Record<string, unknown>).employeeCountRange) || null;
    }
    if ((body as Record<string, unknown>)?.yearsInBusinessRange !== undefined) {
      (updateData as Record<string, unknown>).yearsInBusinessRange = cleanString((body as Record<string, unknown>).yearsInBusinessRange) || null;
    }

    // Contact
    if ((body as Record<string, unknown>)?.primaryContactName !== undefined) (updateData as Record<string, unknown>).primaryContactName = cleanString((body as Record<string, unknown>).primaryContactName);
    if ((body as Record<string, unknown>)?.primaryContactTitle !== undefined) (updateData as Record<string, unknown>).primaryContactTitle = cleanString((body as Record<string, unknown>).primaryContactTitle);
    if ((body as Record<string, unknown>)?.primaryContactEmail !== undefined) {
      (updateData as Record<string, unknown>).primaryContactEmail = existingEmail;
      (updateData as Record<string, unknown>).primaryContactEmailLower = existingEmailLower;
    }
    if ((body as Record<string, unknown>)?.primaryContactPhone !== undefined) (updateData as Record<string, unknown>).primaryContactPhone = cleanString((body as Record<string, unknown>).primaryContactPhone);

    // Lifecycle
    if ((body as Record<string, unknown>)?.salesStage !== undefined) (updateData as Record<string, unknown>).salesStage = cleanString((body as Record<string, unknown>).salesStage);
    if (requestedPayment) (updateData as Record<string, unknown>).paymentStatus = requestedPayment;
    if ((body as Record<string, unknown>)?.retainerStatus !== undefined) (updateData as Record<string, unknown>).retainerStatus = cleanString((body as Record<string, unknown>).retainerStatus);

    // Ownership
    if ((body as Record<string, unknown>)?.salesOwner !== undefined) (updateData as Record<string, unknown>).salesOwner = cleanString((body as Record<string, unknown>).salesOwner);
    if ((body as Record<string, unknown>)?.accountManager !== undefined) (updateData as Record<string, unknown>).accountManager = cleanString((body as Record<string, unknown>).accountManager);
    if ((body as Record<string, unknown>)?.productionOwner !== undefined) (updateData as Record<string, unknown>).productionOwner = cleanString((body as Record<string, unknown>).productionOwner);

    // Finance
    if ((body as Record<string, unknown>)?.totalContractValueUsd !== undefined) (updateData as Record<string, unknown>).totalContractValueUsd = toNumber((body as Record<string, unknown>).totalContractValueUsd);
    if ((body as Record<string, unknown>)?.totalPaidUsd !== undefined) (updateData as Record<string, unknown>).totalPaidUsd = toNumber((body as Record<string, unknown>).totalPaidUsd);
    if ((body as Record<string, unknown>)?.openBalanceUsd !== undefined) (updateData as Record<string, unknown>).openBalanceUsd = toNumber((body as Record<string, unknown>).openBalanceUsd);

    if ((body as Record<string, unknown>)?.segmentServices !== undefined) (updateData as Record<string, unknown>).segmentServices = normalizeSlugArray((body as Record<string, unknown>).segmentServices);
    if ((body as Record<string, unknown>)?.segmentBusinessType !== undefined) {
      (updateData as Record<string, unknown>).segmentBusinessType = normalizeOptionalSlug((body as Record<string, unknown>).segmentBusinessType);
    }
    if ((body as Record<string, unknown>)?.segmentIndustry !== undefined) (updateData as Record<string, unknown>).segmentIndustry = normalizeOptionalSlug((body as Record<string, unknown>).segmentIndustry);
    if ((body as Record<string, unknown>)?.segmentGeo !== undefined) {
      (updateData as Record<string, unknown>).segmentGeo = normalizeOptionalSlug((body as Record<string, unknown>).segmentGeo);
    } else if ((body as Record<string, unknown>)?.country !== undefined) {
      const derivedGeo = slugify(cleanString((body as Record<string, unknown>).country));
      (updateData as Record<string, unknown>).segmentGeo = derivedGeo || null;
    }
    (updateData as Record<string, unknown>).primaryContactEmailLower = existingEmailLower;
    (updateData as Record<string, unknown>).tenantId = tenantId;

    // If payment becomes paid/partial AND orderId is missing => generate LC-0001
    // Also: if already paid but missing orderId (edge case), generate it when admin hits update again.
    const becomesPaidNow = requestedPayment ? isPaidLike(requestedPayment) : false;
    const shouldGenerateOrderId =
      (becomesPaidNow && !existingOrderId) || (wasPaidLike && !existingOrderId && requestedPayment === null);

    let newOrderId: string | null = null;
    if (shouldGenerateOrderId && canMarkPaid(me.role)) {
      newOrderId = await generateNextOrderId(tenantId);
      (updateData as Record<string, unknown>).orderId = newOrderId;
    }

    // Timestamps
    const now = admin.firestore.FieldValue.serverTimestamp();
    (updateData as Record<string, unknown>).updatedAt = now;
    (updateData as Record<string, unknown>).lastActivity = now;

    const changes = Object.entries(updateData)
      .filter(([field]) => !["updatedAt", "lastActivity"].includes(field))
      .filter(([field, value]) => value !== (existing as Record<string, unknown>)[field])
      .map(([field, value]) => ({
        field,
        oldValue: (existing as Record<string, unknown>)[field],
        newValue: value,
      }));

    await ref.set(updateData, { merge: true });

    if (changes.length) {
      try {
        await logEvent({
          tenantId,
          type: "client.updated",
          title: "Client updated",
          description: `${(existing as Record<string, unknown>).companyName || "Client"} updated.`,
          entityType: "client",
          entityId: id,
          actor: { uid: me.uid, name: me.name || me.fullName || "" },
          metadata: {
            ip: getClientIp(req),
            userAgent: req.headers.get("user-agent") || "",
          },
          audit: {
            action: "update",
            resource: "customer",
            resourceId: id,
            changes,
          },
        });
      } catch (auditError) {
        console.error("audit log error:", auditError);
      }
    }

    const becomesPaid = requestedPayment === "Paid" && existingPayment !== "Paid";
    if (becomesPaid) {
      const dealDocs = await queryWithTenant(
        db.collection("deals").where("clientId", "==", id).orderBy("createdAt", "desc").limit(1),
        tenantId
      );
      const dealDoc = dealDocs[0] || null;
      const dealData = dealDoc?.data() || {};

      if (dealDoc && !dealData.orderId) {
        const nextOrderId = newOrderId || (await generateNextOrderId(tenantId));
        await dealDoc.ref.set({ orderId: nextOrderId, updatedAt: now }, { merge: true });
      }

      if (dealDoc) {
        await createProjectFromDeal({
          tenantId,
          deal: { id: dealDoc.id, ...dealData },
          client: { id, ...(existing as Record<string, unknown>), ...(updateData as Record<string, unknown>)},
          actor: { uid: me.uid, name: me.name || me.fullName || "" },
        });

        await logEvent({
          tenantId,
          type: "deal.paid_marked",
          title: "Deal marked paid",
          description: `${dealData.dealName || dealData.leadName || "Deal"} marked paid.`,
          entityType: "deal",
          entityId: dealDoc.id,
          actor: { uid: me.uid, name: me.name || me.fullName || "" },
        });

        const recipients = await getUsersByRoles(["admin", "super_admin", "finance"], tenantId);
        const assignedAmUid = String(dealData.ownerId || dealData.ownerUid || "");
        if (assignedAmUid) {
          recipients.push({ uid: assignedAmUid, role: "am", tenantId });
        }
        await createNotifications({
          recipients,
          tenantId,
          type: "deal_paid",
          title: "Deal marked paid",
          message: `${dealData.dealName || dealData.leadName || "Deal"} marked paid.`,
          entityType: "deal",
          entityId: dealDoc.id,
          createdBy: { uid: me.uid, name: me.name || me.fullName || "" },
        });
      }

      const email = cleanString((existing as Record<string, unknown>)?.primaryContactEmail || (updateData as Record<string, unknown>).primaryContactEmail);
      if (email && !cleanString((existing as Record<string, unknown>)?.portalUserUid)) {
        await createClientInvite({
          tenantId,
          email,
          clientId: id,
          createdByUid: me.uid,
        });

        await ref.set(
          {
            portalInviteSentAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        const notifyIds = await getUserIdsByRoles(["admin", "super_admin", "am_manager"], tenantId);
        await Promise.all(
          notifyIds.map((uid) =>
            createNotification({
              toUserId: uid,
              title: "Client portal invite queued",
              body: `${email} will receive a portal activation email.`,
              entityType: "client",
              entityId: id,
              deepLink: "/admin/clients",
              tenantId,
              createdBy: { uid: me.uid, name: me.name || me.fullName || "" },
            })
          )
        );
      }
    }

    try {
      await dispatchWebhookEvent({
        tenantId,
        event: "client.updated",
        entityType: "client",
        entityId: id,
        payload: {
          clientId: id,
          companyName: String((updateData as Record<string, unknown>).companyName || (existing as Record<string, unknown>).companyName || ""),
          changes,
          orderId: newOrderId || existingOrderId || "",
        },
        actor: { uid: me.uid, email: me.email || null, role: me.role || null },
      });
    } catch (webhookError) {
      console.error("client.updated webhook dispatch error:", webhookError);
    }

    return NextResponse.json({ ok: true, id, orderId: newOrderId || existingOrderId || "" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err instanceof Error ? err.message : undefined) ?? "Failed to update client" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  return handleUpdate(req);
}

export async function POST(req: Request) {
  return handleUpdate(req);
}
