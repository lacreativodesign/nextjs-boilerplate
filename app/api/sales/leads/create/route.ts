import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID, normalizeTenantId } from "@/lib/tenant";
import { createNotifications, getUsersByRoles } from "@/lib/notifications";
import {
  createSalesEvent,
  getUserNameById,
  getWatcherUserIds,
  isSales,
  notifyUsers,
  parseNumber,
  parseString,
  requireSalesWrite,
  serverTimestamp,
  userLabel,
} from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const parseIso = (value: any) => {
      if (!value) return null;
      const raw = String(value).trim();
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return null;
      return date.toISOString();
    };

    const role = auth.user.role || "";
    const isManager = String(role).toLowerCase() === "sales_manager";
    if (!isSales(role) && !isManager) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const payload = await req.json();
    const companyName = parseString(payload.companyName || payload.company, "");
    const contactName = parseString(payload.contactName || payload.name, "");
    const contactEmail = parseString(payload.contactEmail || payload.email, "");
    const contactPhone = parseString(payload.contactPhone || payload.phone, "");
    const source = parseString(payload.source, "manual") || "manual";
    const notes = parseString(payload.notes, "");
    const rawStatusInput = parseString(payload.status || payload.stage, "new").toLowerCase();
    const status = rawStatusInput
      .replace(/\s+/g, "_")
      .replace("new_lead", "new")
      .replace("proposal_sent", "proposal_sent")
      .replace("closed_won", "closed_won")
      .replace("closed_lost", "closed_lost");
    const allowedStatuses = [
      "new",
      "contacted",
      "qualified",
      "proposal_sent",
      "negotiation",
      "closed_won",
      "closed_lost",
    ];
    const normalizedStatus = allowedStatuses.includes(status) ? status : "new";
    const statusToStage = (value: string) => {
      switch (value) {
        case "contacted":
          return "Contacted";
        case "qualified":
          return "Qualified";
        case "proposal_sent":
          return "Proposal Sent";
        case "negotiation":
          return "Negotiation";
        case "closed_won":
          return "Closed Won";
        case "closed_lost":
          return "Closed Lost";
        default:
          return "New Lead";
      }
    };
    const disposition = parseString(payload.disposition, "");
    const expectedValueUsd = parseNumber(payload.expectedValueUsd, 0);
    const packageName = parseString(payload.packageName, "");
    const interestedServices = Array.isArray(payload.interestedServices)
      ? payload.interestedServices.map((item: any) => parseString(item, "").trim()).filter(Boolean)
      : [];
    const probability = parseNumber(payload.probability, 0);
    const lastContactedAt = parseIso(payload.lastContactedAt);
    const nextFollowUpAt = parseIso(payload.nextFollowUpAt);

    const needsFollowUp = disposition.trim().toLowerCase() === "follow-up needed";
    if (needsFollowUp && !payload.nextFollowUpAt) {
      return NextResponse.json({ ok: false, error: "Follow-up date and time are required." }, { status: 400 });
    }
    if (payload.nextFollowUpAt && !String(payload.nextFollowUpAt).includes("T")) {
      return NextResponse.json({ ok: false, error: "Follow-up date and time are required." }, { status: 400 });
    }
    if (payload.nextFollowUpAt && !nextFollowUpAt) {
      return NextResponse.json({ ok: false, error: "Invalid follow-up date." }, { status: 400 });
    }

    const requestedOwnerId = parseString(payload.ownerUid || payload.ownerId, "");
    const ownerId = requestedOwnerId && isManager ? requestedOwnerId : auth.user.uid;
    const ownerName = ownerId ? await getUserNameById(ownerId) : "";

    const tenantId = normalizeTenantId(auth.user.tenantId || DEFAULT_TENANT_ID);
    const docRef = await adminDb.collection("leads").add({
      tenantId,
      leadId: null,
      company: companyName,
      name: contactName || companyName,
      email: contactEmail,
      phone: contactPhone,
      companyName,
      contactName,
      contactEmail,
      contactPhone,
      source,
      notes,
      status: normalizedStatus,
      stage: statusToStage(normalizedStatus),
      disposition,
      expectedValueUsd,
      packageName,
      interestedServices,
      probability,
      lastContactedAt,
      nextFollowUpAt,
      ownerUid: ownerId,
      ownerId,
      ownerName: ownerName || userLabel(auth.user),
      lastActivityAt: serverTimestamp(),
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdById: auth.user.uid,
      createdBy: auth.user.uid,
      updatedBy: auth.user.uid,
    });

    await docRef.set({ leadId: docRef.id }, { merge: true });

    await createSalesEvent({
      type: "lead.created",
      title: "Lead created",
      description: `${contactName || companyName || "Lead"} created`,
      entityType: "lead",
      entityId: docRef.id,
      createdByUid: auth.user.uid,
      createdByName: userLabel(auth.user),
      metadata: { ownerId, ownerName: ownerName || userLabel(auth.user) },
      tenantId,
    });

    const watchers = await getWatcherUserIds(tenantId);
    await notifyUsers({
      userIds: [ownerId, ...watchers],
      title: "Lead created",
      body: `${contactName || companyName || "Lead"} was created in Sales.`,
      deepLink: "/sales/leads",
      entityType: "lead",
      entityId: docRef.id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
      tenantId,
    });

    const recipients = await getUsersByRoles(["sales_manager", "admin", "super_admin"], tenantId);
    await createNotifications({
      recipients,
      tenantId,
      type: "new_lead",
      title: "New lead created",
      message: `${contactName || companyName || "Lead"} was created.`,
      entityType: "lead",
      entityId: docRef.id,
      deepLink: "/sales/leads",
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error("sales leads create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to create lead." }, { status: 500 });
  }
}
