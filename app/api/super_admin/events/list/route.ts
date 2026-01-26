import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import { requireSuperAdmin } from "../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventRecord = {
  id: string;
  type: string;
  title: string;
  description: string;
  entityType: string | null;
  entityId: string | null;
  actorUid: string | null;
  actorName: string | null;
  createdAt: string | null;
  metadata: Record<string, unknown>;
};

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampLimit(value: string | null, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireSuperAdmin(req);
    const { searchParams } = req.nextUrl;
    const q = String(searchParams.get("q") || "").trim().toLowerCase();
    const type = String(searchParams.get("type") || "").trim();
    const entityType = String(searchParams.get("entityType") || "").trim();
    const actorUid = String(searchParams.get("actorUid") || "").trim();
    const dateFrom = parseDate(searchParams.get("dateFrom"));
    const dateTo = parseDate(searchParams.get("dateTo"));
    const limit = clampLimit(searchParams.get("limit"), 50);
    const tenantId = normalizeTenantId(user.tenantId);

    const baseQuery = adminDb.collection("events").orderBy("createdAt", "desc");
    const tenantQueries: FirebaseFirestore.Query[] = [];

    const applyFilters = (query: FirebaseFirestore.Query) => {
      let qy = query.where("tenantId", "==", tenantId);
      if (type) qy = qy.where("type", "==", type);
      if (entityType) qy = qy.where("entityType", "==", entityType);
      if (actorUid) qy = qy.where("createdByUid", "==", actorUid);
      if (dateFrom) qy = qy.where("createdAt", ">=", dateFrom);
      if (dateTo) qy = qy.where("createdAt", "<=", dateTo);
      return qy;
    };

    tenantQueries.push(applyFilters(baseQuery).limit(limit));
    if (tenantId === DEFAULT_TENANT_ID) {
      let nullQuery: FirebaseFirestore.Query = baseQuery.where("tenantId", "==", null);
      if (type) nullQuery = nullQuery.where("type", "==", type);
      if (entityType) nullQuery = nullQuery.where("entityType", "==", entityType);
      if (actorUid) nullQuery = nullQuery.where("createdByUid", "==", actorUid);
      if (dateFrom) nullQuery = nullQuery.where("createdAt", ">=", dateFrom);
      if (dateTo) nullQuery = nullQuery.where("createdAt", "<=", dateTo);
      tenantQueries.push(nullQuery.limit(limit));
    }

    const snapshots = await Promise.all(tenantQueries.map((query) => query.get()));
    const map = new Map<string, EventRecord>();

    snapshots.forEach((snap) => {
      snap.docs.forEach((doc) => {
        if (map.has(doc.id)) return;
        const data = doc.data() || {};
        if (docTenantId(data) !== tenantId) return;
        map.set(doc.id, {
          id: doc.id,
          type: String(data.type || ""),
          title: String(data.title || ""),
          description: String(data.description || ""),
          entityType: data.entityType ? String(data.entityType) : null,
          entityId: data.entityId ? String(data.entityId) : null,
          actorUid: data.createdByUid ? String(data.createdByUid) : null,
          actorName: data.createdByName ? String(data.createdByName) : null,
          createdAt: toISO(data.createdAt),
          metadata: (data.metadata as Record<string, unknown>) || {},
        });
      });
    });

    let events = Array.from(map.values());

    if (q) {
      events = events.filter((event) => {
        const haystack = [event.title, event.description, event.entityId].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }

    events.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    events = events.slice(0, limit);

    return NextResponse.json({ ok: true, events });
  } catch (err: any) {
    console.error("super-admin/events list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load events.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
