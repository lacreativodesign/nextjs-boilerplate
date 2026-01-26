import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { logEvent } from "@/lib/audit";
import { createProjectFromDeal } from "@/lib/projects";
import { normalizeInvoiceStatus } from "@/lib/finance/status";

export async function maybeAutoCreateProjectFromInvoice({
  invoiceId,
  invoiceData,
  tenantId,
  actor,
}: {
  invoiceId: string;
  invoiceData: Record<string, any>;
  tenantId?: string | null;
  actor?: { uid?: string | null; name?: string | null } | null;
}) {
  if (!invoiceId) return null;
  const status = normalizeInvoiceStatus(invoiceData.status);
  if (status !== "paid") return null;
  if (invoiceData.projectId) return null;
  const type = String(invoiceData.type || "").toLowerCase();
  if (!["service", "retainer"].includes(type)) return null;

  const clientId = String(invoiceData.clientId || "");
  const dealId = String(invoiceData.dealId || "");
  if (!clientId) return null;

  const [clientSnap, dealSnap] = await Promise.all([
    adminDb.collection("clients").doc(clientId).get(),
    dealId ? adminDb.collection("deals").doc(dealId).get() : Promise.resolve(null),
  ]);

  const client = clientSnap?.exists ? { id: clientSnap.id, ...(clientSnap.data() || {}) } : { id: clientId };
  const dealData = dealSnap?.exists ? dealSnap.data() || {} : {};
  const deal = {
    id: dealSnap?.id || dealId || null,
    ...dealData,
    orderId: String(dealData?.orderId || invoiceData.orderId || ""),
    dealName: String(dealData?.dealName || invoiceData.title || invoiceData.orderId || ""),
    clientId: clientId || dealData?.clientId || "",
  };

  const created = await createProjectFromDeal({
    tenantId,
    deal,
    client,
    actor,
    stageOverride: "Kickoff",
  });

  if (!created?.id) return null;

  await adminDb
    .collection("invoices")
    .doc(invoiceId)
    .set({ projectId: created.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  await logEvent({
    tenantId: tenantId || null,
    type: "project_auto_created",
    title: "Project auto-created",
    description: `Project auto-created from paid invoice ${invoiceData.orderId || invoiceId}.`,
    entityType: "project",
    entityId: created.id,
    actor: actor || null,
    metadata: { invoiceId, clientId, dealId: dealId || null },
  });

  return created;
}
