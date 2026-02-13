import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { DASHBOARD_TEMPLATES, getWidgetDefinition } from "@/lib/dashboard/widget-registry";
import type { DashboardLayout, DashboardWidget, DashboardWidgetLayoutItem, DashboardWidgetTemplateId, DashboardWidgetType } from "@/lib/dashboard/types";

const LAYOUT_COLLECTION = "dashboard_layouts";
const WIDGET_COLLECTION = "dashboard_widgets";

const defaultItems: DashboardWidgetLayoutItem[] = [
  { widgetId: "seed-revenue", x: 0, y: 0, w: 6, h: 4 },
  { widgetId: "seed-invoice", x: 6, y: 0, w: 3, h: 4 },
  { widgetId: "seed-activity", x: 9, y: 0, w: 3, h: 4 },
];

function toIso(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function layoutDocId(tenantId: string, userId: string) {
  return `${tenantId}_${userId}`;
}

export async function getDashboardState(tenantId: string, userId: string) {
  const [layoutSnap, widgetsSnap] = await Promise.all([
    adminDb.collection(LAYOUT_COLLECTION).doc(layoutDocId(tenantId, userId)).get(),
    adminDb.collection(WIDGET_COLLECTION).where("tenantId", "==", tenantId).where("userId", "==", userId).get(),
  ]);

  const widgets: DashboardWidget[] = widgetsSnap.docs.map((doc) => {
    const raw = doc.data();
    return {
      id: doc.id,
      tenantId,
      userId,
      type: raw.type,
      title: raw.title,
      config: raw.config || {},
      dataSource: raw.dataSource || "unknown",
      createdAt: toIso(raw.createdAt),
      updatedAt: toIso(raw.updatedAt),
    };
  });

  if (!layoutSnap.exists) {
    if (!widgets.length) {
      const seeded = await Promise.all([
        createWidget(tenantId, userId, { type: "revenue_chart" }),
        createWidget(tenantId, userId, { type: "invoice_status" }),
        createWidget(tenantId, userId, { type: "recent_activity" }),
      ]);
      const seedItems = defaultItems.map((item, idx) => ({ ...item, widgetId: seeded[idx].id }));
      await saveLayout(tenantId, userId, seedItems);
      return {
        layout: {
          id: layoutDocId(tenantId, userId),
          tenantId,
          userId,
          items: seedItems,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies DashboardLayout,
        widgets: seeded,
      };
    }

    const items = widgets.map((widget, idx) => ({
      widgetId: widget.id,
      x: (idx % 3) * 4,
      y: Math.floor(idx / 3) * 4,
      w: 4,
      h: 4,
    }));
    await saveLayout(tenantId, userId, items);
    return {
      layout: { id: layoutDocId(tenantId, userId), tenantId, userId, items },
      widgets,
    };
  }

  const rawLayout = layoutSnap.data() || {};
  return {
    layout: {
      id: layoutSnap.id,
      tenantId,
      userId,
      items: (rawLayout.items || []) as DashboardWidgetLayoutItem[],
      createdAt: toIso(rawLayout.createdAt),
      updatedAt: toIso(rawLayout.updatedAt),
    } satisfies DashboardLayout,
    widgets,
  };
}

export async function saveLayout(tenantId: string, userId: string, items: DashboardWidgetLayoutItem[]) {
  const cleanItems = items.map((item) => ({
    widgetId: String(item.widgetId),
    x: Math.max(0, Number(item.x || 0)),
    y: Math.max(0, Number(item.y || 0)),
    w: Math.max(2, Number(item.w || 4)),
    h: Math.max(2, Number(item.h || 4)),
  }));

  const now = admin.firestore.FieldValue.serverTimestamp();
  await adminDb.collection(LAYOUT_COLLECTION).doc(layoutDocId(tenantId, userId)).set(
    {
      tenantId,
      userId,
      items: cleanItems,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  return cleanItems;
}

export async function createWidget(
  tenantId: string,
  userId: string,
  input: { type: DashboardWidgetType; title?: string; config?: Record<string, unknown> }
): Promise<DashboardWidget> {
  const def = getWidgetDefinition(input.type);
  if (!def) throw new Error("Unsupported widget type");

  const now = admin.firestore.FieldValue.serverTimestamp();
  const widgetRef = adminDb.collection(WIDGET_COLLECTION).doc();
  await widgetRef.set({
    tenantId,
    userId,
    type: input.type,
    title: input.title || def.title,
    config: { ...def.defaultConfig, ...(input.config || {}) },
    dataSource: def.dataSource,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: widgetRef.id,
    tenantId,
    userId,
    type: input.type,
    title: input.title || def.title,
    config: { ...def.defaultConfig, ...(input.config || {}) },
    dataSource: def.dataSource,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function addWidgetAndPlace(
  tenantId: string,
  userId: string,
  input: { type: DashboardWidgetType; title?: string; config?: Record<string, unknown>; x?: number; y?: number }
) {
  const widget = await createWidget(tenantId, userId, input);
  const def = getWidgetDefinition(input.type);
  const state = await getDashboardState(tenantId, userId);
  const y = Math.max(...state.layout.items.map((item) => item.y + item.h), 0);
  const placement: DashboardWidgetLayoutItem = {
    widgetId: widget.id,
    x: Math.max(0, Number(input.x ?? 0)),
    y: Math.max(0, Number(input.y ?? y)),
    w: def?.defaultSize.w || 4,
    h: def?.defaultSize.h || 4,
  };

  await saveLayout(tenantId, userId, [...state.layout.items, placement]);
  return { widget, placement };
}

export async function removeWidget(tenantId: string, userId: string, widgetId: string) {
  const widgetRef = adminDb.collection(WIDGET_COLLECTION).doc(widgetId);
  const snap = await widgetRef.get();
  if (!snap.exists) return false;
  const row = snap.data() || {};
  if (row.tenantId !== tenantId || row.userId !== userId) return false;

  await widgetRef.delete();
  const state = await getDashboardState(tenantId, userId);
  await saveLayout(
    tenantId,
    userId,
    state.layout.items.filter((item) => item.widgetId !== widgetId)
  );
  return true;
}

export async function getWidgetById(tenantId: string, userId: string, widgetId: string): Promise<DashboardWidget | null> {
  const snap = await adminDb.collection(WIDGET_COLLECTION).doc(widgetId).get();
  if (!snap.exists) return null;
  const row = snap.data() || {};
  if (row.tenantId !== tenantId || row.userId !== userId) return null;

  return {
    id: snap.id,
    tenantId,
    userId,
    type: row.type,
    title: row.title,
    config: row.config || {},
    dataSource: row.dataSource || "unknown",
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export async function applyTemplate(tenantId: string, userId: string, templateId: DashboardWidgetTemplateId) {
  const template = DASHBOARD_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error("Template not found");

  const current = await getDashboardState(tenantId, userId);
  const batch = adminDb.batch();
  current.widgets.forEach((widget) => {
    batch.delete(adminDb.collection(WIDGET_COLLECTION).doc(widget.id));
  });
  await batch.commit();

  const created = await Promise.all(template.widgets.map((w) => createWidget(tenantId, userId, { type: w.type, title: w.title, config: w.config })));
  const items = template.widgets.map((w, index) => ({
    widgetId: created[index].id,
    x: w.x,
    y: w.y,
    w: w.w ?? getWidgetDefinition(w.type)?.defaultSize.w ?? 4,
    h: w.h ?? getWidgetDefinition(w.type)?.defaultSize.h ?? 4,
  }));

  await saveLayout(tenantId, userId, items);
  return { template, widgets: created, items };
}
