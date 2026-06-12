import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import {
  createSalesEvent,
  getUserNameById,
  getWatcherUserIds,
  notifyUsers,
  parseNumber,
  parseString,
  requireSalesRead,
  requireSalesWrite,
  serverTimestamp,
  userLabel,
} from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const id = parseString(body.id, "");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Lead id is required." }, { status: 400 });
    }

    const docRef = adminDb.collection("leads").doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }

    const existing = snapshot.data() || {};
    const role = auth.user.role || "";
    if (!auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant context missing." }, { status: 403 });
    }
    const tenantId = normalizeTenantId(auth.user.tenantId);
    const canWrite = await requireSalesWrite();
    if (!canWrite.ok) {
      return NextResponse.json({ ok: false, error: canWrite.error }, { status: canWrite.status });
    }

    if (docTenantId(existing) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const isOwner = existing.ownerUid === auth.user.uid || existing.ownerId === auth.user.uid;
    if (role === "sales" && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const companyName = parseString(body.companyName || body.company, existing.companyName || existing.company || "");
    const contactName = parseString(body.contactName || body.name, existing.contactName || existing.name || "");
    const contactEmail = parseString(body.contactEmail || body.email, existing.contactEmail || existing.email || "");
    const contactPhone = parseString(body.contactPhone || body.phone, existing.contactPhone || existing.phone || "");
    const source = parseString(body.source, existing.source || "");
    const notes = parseString(body.notes, existing.notes || "");
    const disposition = parseString(body.disposition, existing.disposition || "");
    const expectedValueUsd = parseNumber(body.expectedValueUsd, Number(existing.expectedValueUsd || 0));
    const packageName = parseString(body.packageName, existing.packageName || "");
    const interestedServices = Array.isArray(body.interestedServices)
      ? body.interestedServices.map((item: any) => parseString(item, "").trim()).filter(Boolean)
      : Array.isArray(existing.interestedServices)
      ? existing.interestedServices.map((item: any) => parseString(item, "").trim()).filter(Boolean)
      : [];
    const probability = parseNumber(body.probability, Number(existing.probability || 0));
    const rawStatusInput = parseString(body.status || body.stage, existing.status || "new").toLowerCase();
    const statusInput = rawStatusInput
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
    const status = allowedStatuses.includes(statusInput) ? statusInput : "new";
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

    const parseIso = (value: any, fallback?: any) => {
      if (!value) return fallback ?? null;
      const raw = String(value).trim();
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return fallback ?? null;
      return date.toISOString();
    };
    const lastContactedAt = parseIso(body.lastContactedAt, existing.lastContactedAt || null);
    const nextFollowUpAt = parseIso(body.nextFollowUpAt, existing.nextFollowUpAt || null);

    const needsFollowUp = disposition.trim().toLowerCase() === "follow-up needed";
    if (needsFollowUp && !body.nextFollowUpAt && !existing.nextFollowUpAt) {
      return NextResponse.json({ ok: false, error: "Follow-up date and time are required." }, { status: 400 });
    }
    if (body.nextFollowUpAt && !String(body.nextFollowUpAt).includes("T")) {
      return NextResponse.json({ ok: false, error: "Follow-up date and time are required." }, { status: 400 });
    }
    if (body.nextFollowUpAt && !nextFollowUpAt) {
      return NextResponse.json({ ok: false, error: "Invalid follow-up date." }, { status: 400 });
    }

    let ownerId = existing.ownerUid || existing.ownerId || null;
    let ownerName = existing.ownerName || "";

    if (
      canWrite.ok &&
      body.ownerUid !== undefined &&
      (role === "sales_manager" || role === "admin" || role === "super_admin")
    ) {
      const nextOwnerId = parseString(body.ownerUid || body.ownerId, "");
      ownerId = nextOwnerId || null;
      ownerName = ownerId ? await getUserNameById(ownerId) : "";
    }

    const assignmentChanged = String(existing.ownerUid || existing.ownerId || "") !== String(ownerId || "");
    const statusChanged = String(existing.status || "new") !== status;
    const updates: Record<string, any> = {
      tenantId,
      company: companyName,
      name: contactName,
      email: contactEmail,
      phone: contactPhone,
      companyName,
      contactName,
      contactEmail,
      contactPhone,
      source,
      notes,
      status,
      stage: statusToStage(status),
      disposition,
      expectedValueUsd,
      packageName,
      interestedServices,
      probability,
      lastContactedAt,
      nextFollowUpAt,
      ownerUid: ownerId,
      ownerId,
      ownerName,
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: auth.user.uid,
    };

    await docRef.set(updates, { merge: true });

    await createSalesEvent({
      type: assignmentChanged ? "lead.assigned" : statusChanged ? "lead.status_changed" : "lead.updated",
      title: assignmentChanged ? "Lead assigned" : statusChanged ? "Lead status updated" : "Lead updated",
      description: assignmentChanged
        ? `${contactName || companyName || "Lead"} assigned to ${ownerName || "rep"}.`
        : statusChanged
        ? `${contactName || companyName || "Lead"} moved to ${status}.`
        : `${contactName || companyName || "Lead"} updated`,
      entityType: "lead",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: userLabel(auth.user),
      metadata: { status, ownerId, ownerName },
      tenantId,
    });

    const watchers = await getWatcherUserIds(tenantId);
    await notifyUsers({
      userIds: [ownerId, ...watchers],
      title: assignmentChanged ? "Lead assigned" : statusChanged ? "Lead status updated" : "Lead updated",
      body: assignmentChanged
        ? `${contactName || companyName || "Lead"} assigned to ${ownerName || "rep"}.`
        : statusChanged
        ? `${contactName || companyName || "Lead"} moved to ${status}.`
        : `${contactName || companyName || "Lead"} was updated.`,
      deepLink: "/sales/leads",
      entityType: "lead",
      entityId: id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
      tenantId,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales leads update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update lead." }, { status: 500 });
  }
}
