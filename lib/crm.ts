import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { logEvent } from "@/lib/audit";
import { queueClientActivationInvite } from "@/lib/clientActivation";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import { getCurrentUser, normalizeRole } from "@/app/api/admin/_utils";
import { createProjectFromDeal } from "@/lib/projects";

export const DEAL_STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const LEAD_STATUSES = ["new", "qualified", "converted"] as const;

export function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function isCrmRole(role?: string | null) {
  const normalized = normalizeRole(role || "");
  return normalized === "sales" || normalized === "sales_manager" || normalized === "admin";
}

export function canCreateLeads(role?: string | null) {
  return normalizeRole(role || "") === "sales";
}

export function canApproveDiscount(role?: string | null) {
  return normalizeRole(role || "") === "sales_manager";
}

export function canManageOwnDeals(role?: string | null) {
  return normalizeRole(role || "") === "sales";
}

export function isAdminReadOnly(role?: string | null) {
  return normalizeRole(role || "") === "admin";
}

export async function requireCrmUser() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (!isCrmRole(me.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user: me, tenantId: normalizeTenantId(me.tenantId || DEFAULT_TENANT_ID) };
}

export function stageIndex(stage?: string | null) {
  return DEAL_STAGES.indexOf((stage || "new") as DealStage);
}

export function canMoveStage(fromStage?: string | null, toStage?: string | null) {
  const fromIndex = stageIndex(fromStage);
  const toIndex = stageIndex(toStage);
  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex <= fromIndex + 1;
}

export async function createClientFromClosedWonDeal({
  dealId,
  actor,
}: {
  dealId: string;
  actor: { uid: string; name?: string | null; tenantId?: string | null };
}) {
  const dealRef = adminDb.collection("deals").doc(dealId);
  await adminDb.runTransaction(async (tx) => {
    const dealSnap = await tx.get(dealRef);
    if (!dealSnap.exists) {
      throw new Error("Deal not found");
    }

    const deal = dealSnap.data() || {};
    if (deal.stage !== "closed_won") {
      return;
    }
    if (deal.clientId) {
      return;
    }

    const leadId = String(deal.leadId || "");
    const leadRef = leadId ? adminDb.collection("leads").doc(leadId) : null;
    const leadSnap = leadRef ? await tx.get(leadRef) : null;
    const lead = leadSnap?.data() || {};

    const clientRef = adminDb.collection("clients").doc();
    tx.set(clientRef, {
      companyName: String(lead.company || "").trim() || String(deal.title || "").trim() || "Client",
      primaryContactName: String(lead.name || "").trim() || null,
      primaryContactEmail: String(lead.email || "").trim() || null,
      phone: String(lead.phone || "").trim() || null,
      source: String(lead.source || "").trim() || null,
      tenantId: docTenantId(deal),
      crmDealId: dealId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      isDeleted: false,
    });

    tx.set(
      dealRef,
      {
        clientId: clientRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  const closedDeal = await adminDb.collection("deals").doc(dealId).get();
  const closedData = closedDeal.data() || {};
  if (!closedData.clientId) return;

  const clientSnap = await adminDb.collection("clients").doc(String(closedData.clientId)).get();
  const clientData = clientSnap.data() || {};

  if (clientData.primaryContactEmail) {
    await queueClientActivationInvite({
      clientId: String(closedData.clientId),
      clientData: {
        primaryContactEmail: clientData.primaryContactEmail,
        primaryContactName: clientData.primaryContactName,
        companyName: clientData.companyName,
      },
      createdByUid: actor.uid,
      reason: "closed_won_automation",
    });
  }


  await createProjectFromDeal({
    tenantId: actor.tenantId || null,
    deal: { id: dealId, ...closedData, clientId: closedData.clientId },
    client: { id: String(closedData.clientId), ...clientData },
    actor: { uid: actor.uid, name: actor.name || null },
    stageOverride: "inquiry",
  });

  await logEvent({
    tenantId: actor.tenantId || null,
    type: "crm_closed_won_client_created",
    title: "Client created from closed-won deal",
    description: `Deal ${dealId} converted to client ${closedData.clientId}`,
    entityType: "deal",
    entityId: dealId,
    actor: {
      uid: actor.uid,
      name: actor.name || null,
    },
    metadata: {
      clientId: closedData.clientId,
    },
  });
}
