'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DashboardLayout,
  DashboardWidget,
  DashboardWidgetLayoutItem,
  DashboardWidgetType,
  WidgetDataEnvelope,
} from '@/lib/dashboard/types';
import { apiFetch } from '@/lib/api/client';

type Props = {
  heading: string;
  subtitle: string;
};

type LayoutPayload = {
  layout: DashboardLayout;
  widgets: DashboardWidget[];
  widgetTypes: Array<{ type: DashboardWidgetType; title: string; description: string }>;
  templates: Array<{ id: string; name: string; description: string }>;
};

const COLUMNS = 12;
const ROW_HEIGHT = 88;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function WidgetBody({
  widget,
  payload,
}: {
  widget: DashboardWidget;
  payload?: WidgetDataEnvelope;
}) {
  const data = payload?.data || {};
  switch (widget.type) {
    case 'revenue_chart': {
      const series = (data.series as Array<{ month: string; revenue: number }> | undefined) || [];
      return (
        <div className="space-y-1 text-sm">
          {series.map((row) => (
            <div key={row.month} className="flex justify-between">
              <span>{row.month}</span>
              <span>{formatCurrency(row.revenue)}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'invoice_status': {
      const segments = (data.segments as Array<{ name: string; value: number }> | undefined) || [];
      return (
        <div className="space-y-1 text-sm">
          {segments.map((row) => (
            <div key={row.name} className="flex justify-between">
              <span>{row.name}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'task_summary':
    case 'project_status': {
      const bars =
        (data.bars as Array<{ name?: string; status?: string; value: number }> | undefined) || [];
      return (
        <div className="space-y-1 text-sm">
          {bars.map((row) => (
            <div key={row.name || row.status} className="flex justify-between">
              <span>{row.name || row.status}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'top_clients': {
      const rows = (data.rows as Array<{ client: string; revenue: number }> | undefined) || [];
      return (
        <div className="space-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.client} className="flex justify-between">
              <span className="truncate">{row.client}</span>
              <span>{formatCurrency(row.revenue)}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'recent_activity': {
      const entries =
        (data.entries as Array<{ id: string; label: string; actor: string }> | undefined) || [];
      return (
        <ul className="list-disc space-y-1 pl-4 text-sm">
          {entries.map((entry) => (
            <li key={entry.id}>
              {entry.label} · {entry.actor}
            </li>
          ))}
        </ul>
      );
    }
    case 'time_tracking':
      return <div className="text-2xl font-semibold">{String(data.hours || 0)}h</div>;
    case 'leave_calendar': {
      const leaves =
        (data.leaves as Array<{ id: string; employee: string; status: string }> | undefined) || [];
      return (
        <div className="space-y-1 text-sm">
          {leaves.map((leave) => (
            <div key={leave.id} className="flex justify-between">
              <span>{leave.employee}</span>
              <span className="capitalize">{leave.status}</span>
            </div>
          ))}
        </div>
      );
    }
    default:
      return <div className="text-sm text-[var(--text-muted)]">No data.</div>;
  }
}

function WidgetPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
      No data yet
    </div>
  );
}

export default function CustomizableDashboard({ heading, subtitle }: Props) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<DashboardLayout | null>(null);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [widgetTypes, setWidgetTypes] = useState<LayoutPayload['widgetTypes']>([]);
  const [templates, setTemplates] = useState<LayoutPayload['templates']>([]);
  const [dataMap, setDataMap] = useState<Record<string, WidgetDataEnvelope>>({});
  const [activeConfigWidget, setActiveConfigWidget] = useState<string | null>(null);
  const [showSelector, setShowSelector] = useState(false);

  const fetchLayout = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch('/api/dashboard/layout', { cache: 'no-store' });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const payload = (await res.json()) as LayoutPayload;
    setLayout(payload.layout);
    setWidgets(payload.widgets);
    setWidgetTypes(payload.widgetTypes);
    setTemplates(payload.templates);
    setLoading(false);
  }, []);

  const refreshWidget = useCallback(async (widgetId: string) => {
    const res = await apiFetch(`/api/dashboard/widgets/${widgetId}/data`, { cache: 'no-store' });
    if (!res.ok) return;
    const payload = (await res.json()) as WidgetDataEnvelope;
    setDataMap((prev) => ({ ...prev, [widgetId]: payload }));
  }, []);

  useEffect(() => {
    void fetchLayout();
  }, [fetchLayout]);

  useEffect(() => {
    widgets.forEach((widget) => {
      void refreshWidget(widget.id);
    });
    const timer = setInterval(() => {
      widgets.forEach((widget) => {
        void refreshWidget(widget.id);
      });
    }, 60000);
    return () => clearInterval(timer);
  }, [widgets, refreshWidget]);

  const persistLayout = useCallback(async (items: DashboardWidgetLayoutItem[]) => {
    setLayout((prev) => (prev ? { ...prev, items } : prev));
    await apiFetch('/api/dashboard/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  }, []);

  const placementById = useMemo(() => {
    const map = new Map<string, DashboardWidgetLayoutItem>();
    layout?.items.forEach((item) => map.set(item.widgetId, item));
    return map;
  }, [layout]);

  const moveWidget = useCallback(
    (widgetId: string, deltaX: number, deltaY: number) => {
      if (!layout || !boardRef.current) return;
      const boardWidth = boardRef.current.clientWidth || 1;
      const colWidth = boardWidth / COLUMNS;
      const dx = Math.round(deltaX / colWidth);
      const dy = Math.round(deltaY / ROW_HEIGHT);
      const next = layout.items.map((item) =>
        item.widgetId === widgetId
          ? {
              ...item,
              x: Math.max(0, Math.min(COLUMNS - item.w, item.x + dx)),
              y: Math.max(0, item.y + dy),
            }
          : item,
      );
      void persistLayout(next);
    },
    [layout, persistLayout],
  );

  const resizeWidget = useCallback(
    (widgetId: string, deltaX: number, deltaY: number) => {
      if (!layout || !boardRef.current) return;
      const boardWidth = boardRef.current.clientWidth || 1;
      const colWidth = boardWidth / COLUMNS;
      const dw = Math.round(deltaX / colWidth);
      const dh = Math.round(deltaY / ROW_HEIGHT);
      const next = layout.items.map((item) => {
        if (item.widgetId !== widgetId) return item;
        const w = Math.max(2, Math.min(COLUMNS - item.x, item.w + dw));
        const h = Math.max(2, item.h + dh);
        return { ...item, w, h };
      });
      void persistLayout(next);
    },
    [layout, persistLayout],
  );

  if (loading) {
    return (
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 text-[var(--text-muted)]">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>
      </div>

      <div className="flex gap-2">
        <button
          className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
          onClick={() => setShowSelector(true)}
        >
          Add Widget
        </button>
        <select
          className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
          defaultValue=""
          onChange={async (event) => {
            if (!event.target.value) return;
            await apiFetch('/api/dashboard/layout', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ templateId: event.target.value }),
            });
            await fetchLayout();
            event.target.value = '';
          }}
        >
          <option value="">Apply template...</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      <div
        ref={boardRef}
        className="relative min-h-[500px] rounded border border-[var(--border-subtle)] bg-[var(--surface-muted)]"
        style={{
          height: `${Math.max(...(layout?.items.map((x) => x.y + x.h) || [8])) * ROW_HEIGHT}px`,
        }}
      >
        {widgets.map((widget) => {
          const place = placementById.get(widget.id);
          if (!place) return null;
          return (
            <article
              key={widget.id}
              className="absolute overflow-hidden rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-sm"
              style={{
                left: `${(place.x / COLUMNS) * 100}%`,
                top: place.y * ROW_HEIGHT,
                width: `${(place.w / COLUMNS) * 100}%`,
                height: place.h * ROW_HEIGHT,
              }}
            >
              <header
                className="flex cursor-move items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2"
                onMouseDown={(event) => {
                  const startX = event.clientX;
                  const startY = event.clientY;
                  const onUp = (upEvent: MouseEvent) => {
                    moveWidget(widget.id, upEvent.clientX - startX, upEvent.clientY - startY);
                    window.removeEventListener('mouseup', onUp);
                  };
                  window.addEventListener('mouseup', onUp);
                }}
              >
                <h3 className="text-sm font-medium">{widget.title}</h3>
                <div className="flex gap-2">
                  <button
                    className="text-xs text-blue-600"
                    onClick={() => void refreshWidget(widget.id)}
                  >
                    Refresh
                  </button>
                  <button
                    className="text-xs text-[var(--text-muted)]"
                    onClick={() => setActiveConfigWidget(widget.id)}
                  >
                    Config
                  </button>
                  <button
                    className="text-xs text-red-600"
                    onClick={async () => {
                      await apiFetch(`/api/dashboard/widgets/${widget.id}`, { method: 'DELETE' });
                      await fetchLayout();
                    }}
                  >
                    Remove
                  </button>
                </div>
              </header>
              <div className="h-[calc(100%-36px)] overflow-auto p-3">
                {dataMap[widget.id] ? (
                  <WidgetBody widget={widget} payload={dataMap[widget.id]} />
                ) : (
                  <WidgetPlaceholder />
                )}
              </div>
              <div
                className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize bg-[var(--surface-muted)]"
                onMouseDown={(event) => {
                  event.stopPropagation();
                  const startX = event.clientX;
                  const startY = event.clientY;
                  const onUp = (upEvent: MouseEvent) => {
                    resizeWidget(widget.id, upEvent.clientX - startX, upEvent.clientY - startY);
                    window.removeEventListener('mouseup', onUp);
                  };
                  window.addEventListener('mouseup', onUp);
                }}
              />
            </article>
          );
        })}
      </div>

      {showSelector ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-xl rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <h2 className="mb-3 text-lg font-semibold">Add Widget</h2>
            <div className="grid gap-2">
              {widgetTypes.map((widgetType) => (
                <button
                  key={widgetType.type}
                  className="rounded border border-[var(--border-subtle)] p-3 text-left hover:bg-[var(--surface-muted)]"
                  onClick={async () => {
                    await apiFetch('/api/dashboard/widgets', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: widgetType.type }),
                    });
                    setShowSelector(false);
                    await fetchLayout();
                  }}
                >
                  <div className="font-medium">{widgetType.title}</div>
                  <div className="text-xs text-[var(--text-muted)]">{widgetType.description}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 text-right">
              <button
                className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
                onClick={() => setShowSelector(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeConfigWidget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <h2 className="mb-2 text-lg font-semibold">Widget Configuration</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Configuration is managed server-side and persisted per widget instance.
            </p>
            <pre className="mt-3 overflow-auto rounded bg-[var(--surface-muted)] p-2 text-xs">
              {JSON.stringify(
                widgets.find((x) => x.id === activeConfigWidget)?.config || {},
                null,
                2,
              )}
            </pre>
            <div className="mt-3 text-right">
              <button
                className="rounded border border-[var(--border-subtle)] px-3 py-2 text-sm"
                onClick={() => setActiveConfigWidget(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
