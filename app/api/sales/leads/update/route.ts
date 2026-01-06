import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createSalesEvent,
  getUserNameById,
  getWatcherUserIds,
  notifyUsers,
  normalizeStage,
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
    const tenantId = auth.user.tenantId || "";
    const canWrite = await requireSalesWrite();
    if (!canWrite.ok) {
      return NextResponse.json({ ok: false, error: canWrite.error }, { status: canWrite.status });
    }

    if (existing.tenantId && existing.tenantId !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const isOwner = existing.ownerId === auth.user.uid;
    if (role === "sales" && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const stage = normalizeStage(parseString(body.stage, existing.stage || "New Lead"));
    const companyName = parseString(body.companyName, existing.companyName || "");
    const contactName = parseString(body.contactName, existing.contactName || existing.name || "");
    const contactEmail = parseString(body.contactEmail, existing.contactEmail || existing.email || "");
    const contactPhone = parseString(body.contactPhone, existing.contactPhone || existing.phone || "");
    const source = parseString(body.source, existing.source || "");
    const disposition = parseString(body.disposition, existing.disposition || "");
    const valueUsd = parseNumber(body.valueUsd, Number(existing.valueUsd ?? existing.expectedValueUsd ?? 0));
    const packageLabel = parseString(body.packageLabel, existing.packageLabel || existing.packageName || "");
    const services = Array.isArray(body.services)
      ? body.services.map((item: any) => parseString(item, "").trim()).filter(Boolean)
      : Array.isArray(existing.services)
      ? existing.services.map((item: any) => parseString(item, "").trim()).filter(Boolean)
      : Array.isArray(existing.interestedServices)
      ? existing.interestedServices.map((item: any) => parseString(item, "").trim()).filter(Boolean)
      : [];

    const parseIso = (value: any, fallback?: any) => {
      if (!value) return fallback ?? null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return fallback ?? null;
      return date.toISOString();
    };
    const lastContactedAt = parseIso(body.lastContactedAt, existing.lastContactedAt || null);
    const nextFollowUpAt = parseIso(body.nextFollowUpAt, existing.nextFollowUpAt || null);

    let ownerId = existing.ownerId || null;
    let ownerName = existing.ownerName || "";

    if (canWrite.ok && body.ownerId !== undefined && (role === "sales_manager" || role === "admin" || role === "super_admin")) {
      const nextOwnerId = parseString(body.ownerId, "");
      ownerId = nextOwnerId || null;
      ownerName = ownerId ? await getUserNameById(ownerId) : "";
    }

    const stageChanged = String(existing.stage || "") !== stage;
    const updates: Record<string, any> = {
      companyName,
      contactName,
      contactEmail,
      contactPhone,
      source,
      stage,
      disposition,
      valueUsd,
      packageLabel,
      services,
      lastContactedAt,
      nextFollowUpAt,
      ownerId,
      ownerName,
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: auth.user.uid,
    };

    await docRef.set(updates, { merge: true });

    if (stageChanged) {
      const dealsSnap = await adminDb.collection("deals").where("leadId", "==", id).limit(500).get();
      if (!dealsSnap.empty) {
        const batch = adminDb.batch();
        dealsSnap.docs.forEach((doc) => {
          batch.set(
            doc.ref,
            {
              stage,
              updatedAt: serverTimestamp(),
              updatedBy: auth.user.uid,
            },
            { merge: true }
          );
        });
        await batch.commit();
      }
    }

    await createSalesEvent({
      type: stageChanged ? "lead_stage_changed" : "lead_updated",
      title: stageChanged ? "Lead stage updated" : "Lead updated",
      description: stageChanged
        ? `${contactName || companyName || "Lead"} moved to ${stage}.`
        : `${contactName || companyName || "Lead"} updated`,
      entityType: "lead",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: userLabel(auth.user),
      metadata: { stage, ownerId, ownerName },
    });

    const watchers = await getWatcherUserIds(tenantId);
    await notifyUsers({
      userIds: [ownerId, ...watchers],
      title: stageChanged ? "Lead stage moved" : "Lead updated",
      body: stageChanged
        ? `${contactName || companyName || "Lead"} moved to ${stage}.`
        : `${contactName || companyName || "Lead"} was updated.`,
      deepLink: "/sales/pipeline",
      entityType: "lead",
      entityId: id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales leads update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update lead." }, { status: 500 });
  }
}
