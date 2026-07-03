'use client';

import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { DependencyType } from '@/lib/production/critical-path';
import { apiFetch } from '@/lib/api/client';

type ZoomLevel = 'day' | 'week' | 'month';

type ResourceAllocation = {
  resourceId: string;
  resourceName: string;
  allocationPercent: number;
};

type GanttTask = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  progress?: number;
  critical?: boolean;
  milestone?: boolean;
  assignedResources: ResourceAllocation[];
};

type GanttDependency = {
  id: string;
  predecessorTaskId: string;
  successorTaskId: string;
  type: DependencyType;
  lagDays: number;
};

type GanttMilestone = {
  id: string;
  name: string;
  dueDate: string | null;
};

type Props = {
  projectId: string;
  tasks: GanttTask[];
  dependencies: GanttDependency[];
  milestones: GanttMilestone[];
  overAllocatedResources?: Array<{
    resourceId: string;
    resourceName: string;
    date: string;
    totalAllocationPercent: number;
  }>;
  onTaskRescheduled?: (taskId: string, startDate: string, endDate: string) => void;
};

const ROW_HEIGHT = 42;

function dateDiffDays(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function zoomToPixels(zoom: ZoomLevel) {
  if (zoom === 'day') return 24;
  if (zoom === 'week') return 10;
  return 4;
}

function fmtLabel(d: Date, zoom: ZoomLevel) {
  if (zoom === 'day') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (zoom === 'week')
    return `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString(undefined, { month: 'short' })}`;
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export default function GanttChart({
  projectId,
  tasks,
  dependencies,
  milestones,
  overAllocatedResources = [],
  onTaskRescheduled,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<ZoomLevel>('day');
  const [dragging, setDragging] = useState<{
    taskId: string;
    startX: number;
    initialStart: string;
    initialEnd: string;
  } | null>(null);
  const [localTasks, setLocalTasks] = useState(tasks);

  const pixelPerDay = zoomToPixels(zoom);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const { minDate, maxDate } = useMemo(() => {
    const dates = localTasks.flatMap((task) => [new Date(task.startDate), new Date(task.endDate)]);
    const dueDates = milestones.filter((m) => m.dueDate).map((m) => new Date(m.dueDate!));
    const all = [...dates, ...dueDates];
    if (!all.length) {
      const now = new Date();
      return { minDate: now, maxDate: now };
    }
    return {
      minDate: new Date(Math.min(...all.map((d) => d.getTime()))),
      maxDate: new Date(Math.max(...all.map((d) => d.getTime()))),
    };
  }, [localTasks, milestones]);

  const totalDays = Math.max(1, dateDiffDays(minDate, maxDate) + 7);

  const positionedTasks = localTasks.map((task, idx) => {
    const startOffset = dateDiffDays(minDate, new Date(task.startDate));
    const duration = Math.max(1, dateDiffDays(new Date(task.startDate), new Date(task.endDate)));
    return {
      ...task,
      rowIndex: idx,
      x: startOffset * pixelPerDay,
      w: duration * pixelPerDay,
      y: idx * ROW_HEIGHT + 8,
    };
  });

  const taskById = new Map(positionedTasks.map((task) => [task.id, task]));

  const arrows = dependencies
    .map((dep) => {
      const from = taskById.get(dep.predecessorTaskId);
      const to = taskById.get(dep.successorTaskId);
      if (!from || !to) return null;

      const fromX = dep.type === 'start_to_start' ? from.x : from.x + from.w;
      const toX = dep.type === 'finish_to_finish' ? to.x + to.w : to.x;
      const y1 = from.y + 12;
      const y2 = to.y + 12;
      const midX = Math.max(fromX + 12, toX - 12);

      return {
        id: dep.id,
        path: `M ${fromX} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${toX} ${y2}`,
      };
    })
    .filter((arrow): arrow is NonNullable<typeof arrow> => Boolean(arrow));

  async function persistReschedule(taskId: string, startDate: string, endDate: string) {
    await apiFetch(`/api/production/tasks/${taskId}/reschedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate }),
    });
    onTaskRescheduled?.(taskId, startDate, endDate);
  }

  function onMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!dragging) return;
    const deltaX = event.clientX - dragging.startX;
    const deltaDays = Math.round(deltaX / pixelPerDay);

    setLocalTasks((prev) =>
      prev.map((task) =>
        task.id === dragging.taskId
          ? {
              ...task,
              startDate: addDays(dragging.initialStart, deltaDays),
              endDate: addDays(dragging.initialEnd, deltaDays),
            }
          : task,
      ),
    );
  }

  function onMouseUp() {
    if (!dragging) return;
    const updatedTask = localTasks.find((task) => task.id === dragging.taskId);
    if (updatedTask) {
      void persistReschedule(updatedTask.id, updatedTask.startDate, updatedTask.endDate);
    }
    setDragging(null);
  }

  async function exportPng() {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return;

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to render gantt chart image.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = svg.clientWidth || 1200;
    canvas.height = svg.clientHeight || 600;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);

    const pngUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `${projectId}-gantt.png`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    window.print();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(['day', 'week', 'month'] as ZoomLevel[]).map((level) => (
            <button
              key={level}
              className={`px-3 py-1 text-xs rounded-md border ${zoom === level ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300'}`}
              onClick={() => setZoom(level)}
            >
              {level}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 text-xs rounded-md border border-gray-300"
            onClick={exportPng}
          >
            Export PNG
          </button>
          <button
            className="px-3 py-1 text-xs rounded-md border border-gray-300"
            onClick={exportPdf}
          >
            Export PDF
          </button>
        </div>
      </div>

      <div
        className="rounded-lg border border-gray-200 overflow-auto"
        ref={containerRef}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      >
        <div style={{ minWidth: totalDays * pixelPerDay + 200 }}>
          <div
            className="sticky top-0 bg-white z-10 border-b border-gray-200"
            style={{ height: 36 }}
          >
            {Array.from({ length: totalDays }).map((_, idx) => {
              const date = new Date(minDate);
              date.setUTCDate(date.getUTCDate() + idx);
              return (
                <span
                  key={idx}
                  className="absolute text-[10px] text-gray-500"
                  style={{ left: idx * pixelPerDay + 160, top: 10 }}
                >
                  {fmtLabel(date, zoom)}
                </span>
              );
            })}
          </div>

          <div className="relative" style={{ height: localTasks.length * ROW_HEIGHT + 24 }}>
            <svg
              width={totalDays * pixelPerDay + 220}
              height={localTasks.length * ROW_HEIGHT + 24}
              className="absolute inset-0 pointer-events-none"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 6 3, 0 6" fill="#6b7280" />
                </marker>
              </defs>
              {arrows.map((arrow) => (
                <path
                  key={arrow.id}
                  d={arrow.path}
                  stroke="#6b7280"
                  strokeWidth="1.2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />
              ))}
            </svg>

            {positionedTasks.map((task) => (
              <div
                key={task.id}
                className="absolute flex items-center"
                style={{ top: task.y, left: 0, height: 22 }}
              >
                <div className="w-40 px-2 text-xs truncate">{task.title}</div>
                <button
                  className={`relative h-5 rounded text-[10px] text-white ${task.critical ? 'bg-red-600' : 'bg-blue-600'}`}
                  style={{ marginLeft: task.x, width: Math.max(6, task.w) }}
                  onMouseDown={(event) =>
                    setDragging({
                      taskId: task.id,
                      startX: event.clientX,
                      initialStart: task.startDate,
                      initialEnd: task.endDate,
                    })
                  }
                >
                  {task.milestone ? '◆' : `${task.progress || 0}%`}
                  <span
                    className="absolute left-0 top-0 h-full bg-white/30"
                    style={{ width: `${Math.min(100, task.progress || 0)}%` }}
                  />
                </button>
              </div>
            ))}

            {milestones
              .filter((m) => m.dueDate)
              .map((milestone) => {
                const x = dateDiffDays(minDate, new Date(milestone.dueDate!)) * pixelPerDay + 160;
                return (
                  <div
                    key={milestone.id}
                    className="absolute top-0 h-full pointer-events-none"
                    style={{ left: x }}
                  >
                    <div className="h-full border-l border-dashed border-amber-500" />
                    <div className="absolute top-1 -left-2 text-[10px] text-amber-700">
                      {milestone.name}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-3">
        <h3 className="text-sm font-semibold mb-2">Resource Allocation</h3>
        {overAllocatedResources.length ? (
          <ul className="space-y-1">
            {overAllocatedResources.map((item) => (
              <li key={`${item.resourceId}-${item.date}`} className="text-xs text-red-600">
                {item.resourceName} over-allocated on {item.date}: {item.totalAllocationPercent}%
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-green-700">No over-allocation detected.</p>
        )}
      </div>
    </div>
  );
}
