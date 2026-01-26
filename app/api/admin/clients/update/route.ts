import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { createClientInvite } from "@/lib/clientInvites";
import { createProjectFromDeal } from "@/lib/projects";
import { generateNextOrderId } from "@/lib/orderIds";
import { logEvent } from "@/lib/audit";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { getCurrentUser } from "../../_utils";
import { normalizeOptionalSlug, normalizeSlugArray, slugify } from "@/lib/segments";
import { assertPermission, Permission } from "../../../lib/permissions";

export const dynamic = "force-dynamic";

function canEditClient(role: string) {
  const r = (role || "").toLowerCase();
  return r === "super_admin" || r === "admin" || r === "sales_manager";
}

function canMarkPaid(role: string) {
  const r = (role || "").toLowerCase();
  return r === "super_admin" || r === "admin";
}

function cleanString(v: any) {
  return String(v ?? "").trim();
}

function normalizeEmail(v: any) {
  return cleanString(v).toLowerCase();
}

function toNumber(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function canonicalPaymentStatus(input: any): "Unpaid" | "Partially Paid" | "Paid" | null {
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

function normalizeExistingStatus(v: any): "Unpaid" | "Partially Paid" | "Paid" {
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

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const id = cleanString(body?.id || body?.clientId);
  if (!id) return NextResponse.json({ ok: false, error: "Client id is required" }, { status: 400 });

  try {
    const ref = db.collection("clients").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });

    const existing = (snap.data() || {}) as any;
    if (docTenantId(existing) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (existing?.deletedAt) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });

    const existingPayment = normalizeExistingStatus(existing?.paymentStatus);
    const existingOrderId = cleanString(existing?.orderId);
    const existingEmail = cleanString(existing?.primaryContactEmail);
    const existingEmailLower = normalizeEmail(existing?.primaryContactEmail);

    const requestedPayment = canonicalPaymentStatus(body?.paymentStatus); // null if not included
    const wantsPaidLike = requestedPayment ? isPaidLike(requestedPayment) : false;
    const wasPaidLike = isPaidLike(existingPayment);

    // Primary email is immutable to preserve 1 email per account
    const incomingEmail = cleanString(body?.primaryContactEmail);
    if (incomingEmail && incomingEmail.toLowerCase() !== existingEmailLower) {
      return NextResponse.json({ ok: false, error: "Primary contact email cannot be changed" }, { status: 400 });
    }

    // If they are trying to set paid/partial, only admin/super_admin can do it.
    if (requestedPayment && wantsPaidLike && !canMarkPaid(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden: only Admin can mark paid" }, { status: 403 });
    }

    // Build safe update payload (only known fields)
    const updateData: any = {};

    // Company
    if (body?.companyName !== undefined) updateData.companyName = cleanString(body.companyName);
    if (body?.website !== undefined) updateData.website = cleanString(body.website);
    if (body?.industry !== undefined) updateData.industry = cleanString(body.industry);
    if (body?.businessType !== undefined) updateData.businessType = cleanString(body.businessType);
    if (body?.country !== undefined) updateData.country = cleanString(body.country);
    if (body?.city !== undefined) updateData.city = cleanString(body.city);
    if (body?.timezone !== undefined) updateData.timezone = cleanString(body.timezone);
    if (body?.employeeCountRange !== undefined) {
      updateData.employeeCountRange = cleanString(body.employeeCountRange) || null;
    }
    if (body?.yearsInBusinessRange !== undefined) {
      updateData.yearsInBusinessRange = cleanString(body.yearsInBusinessRange) || null;
    }

    // Contact
    if (body?.primaryContactName !== undefined) updateData.primaryContactName = cleanString(body.primaryContactName);
    if (body?.primaryContactTitle !== undefined) updateData.primaryContactTitle = cleanString(body.primaryContactTitle);
    if (body?.primaryContactEmail !== undefined) {
      updateData.primaryContactEmail = existingEmail;
      updateData.primaryContactEmailLower = existingEmailLower;
    }
    if (body?.primaryContactPhone !== undefined) updateData.primaryContactPhone = cleanString(body.primaryContactPhone);

    // Lifecycle
    if (body?.salesStage !== undefined) updateData.salesStage = cleanString(body.salesStage);
    if (requestedPayment) updateData.paymentStatus = requestedPayment;
    if (body?.retainerStatus !== undefined) updateData.retainerStatus = cleanString(body.retainerStatus);

    // Ownership
    if (body?.salesOwner !== undefined) updateData.salesOwner = cleanString(body.salesOwner);
    if (body?.accountManager !== undefined) updateData.accountManager = cleanString(body.accountManager);
    if (body?.productionOwner !== undefined) updateData.productionOwner = cleanString(body.productionOwner);

    // Finance
    if (body?.totalContractValueUsd !== undefined) updateData.totalContractValueUsd = toNumber(body.totalContractValueUsd);
    if (body?.totalPaidUsd !== undefined) updateData.totalPaidUsd = toNumber(body.totalPaidUsd);
    if (body?.openBalanceUsd !== undefined) updateData.openBalanceUsd = toNumber(body.openBalanceUsd);

    if (body?.segmentServices !== undefined) updateData.segmentServices = normalizeSlugArray(body.segmentServices);
    if (body?.segmentBusinessType !== undefined) {
      updateData.segmentBusinessType = normalizeOptionalSlug(body.segmentBusinessType);
    }
    if (body?.segmentIndustry !== undefined) updateData.segmentIndustry = normalizeOptionalSlug(body.segmentIndustry);
    if (body?.segmentGeo !== undefined) {
      updateData.segmentGeo = normalizeOptionalSlug(body.segmentGeo);
    } else if (body?.country !== undefined) {
      const derivedGeo = slugify(cleanString(body.country));
      updateData.segmentGeo = derivedGeo || null;
    }
    updateData.primaryContactEmailLower = existingEmailLower;
    updateData.tenantId = tenantId;

    // If payment becomes paid/partial AND orderId is missing => generate LC-0001
    // Also: if already paid but missing orderId (edge case), generate it when admin hits update again.
    const becomesPaidNow = requestedPayment ? isPaidLike(requestedPayment) : false;
    const shouldGenerateOrderId =
      (becomesPaidNow && !existingOrderId) || (wasPaidLike && !existingOrderId && requestedPayment === null);

    let newOrderId: string | null = null;
    if (shouldGenerateOrderId && canMarkPaid(me.role)) {
      newOrderId = await generateNextOrderId();
      updateData.orderId = newOrderId;
    }

    // Timestamps
    const now = admin.firestore.FieldValue.serverTimestamp();
    updateData.updatedAt = now;
    updateData.lastActivity = now;

    await ref.set(updateData, { merge: true });

    const becomesPaid = requestedPayment === "Paid" && existingPayment !== "Paid";
    if (becomesPaid) {
      const dealDocs = await queryWithTenant(
        db.collection("deals").where("clientId", "==", id).orderBy("createdAt", "desc").limit(1),
        tenantId
      );
      const dealDoc = dealDocs[0] || null;
      const dealData = dealDoc?.data() || {};

      if (dealDoc && !dealData.orderId) {
        const nextOrderId = newOrderId || (await generateNextOrderId());
        await dealDoc.ref.set({ orderId: nextOrderId, updatedAt: now }, { merge: true });
      }

      if (dealDoc) {
        await createProjectFromDeal({
          tenantId,
          deal: { id: dealDoc.id, ...dealData },
          client: { id, ...existing, ...updateData },
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
      }

      const email = cleanString(existing?.primaryContactEmail || updateData.primaryContactEmail);
      if (email && !cleanString(existing?.portalUserUid)) {
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

    return NextResponse.json({ ok: true, id, orderId: newOrderId || existingOrderId || "" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to update client" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  return handleUpdate(req);
}

export async function POST(req: Request) {
  return handleUpdate(req);
}
