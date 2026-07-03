export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish';

export type TaskConstraintType = 'must_start_on' | 'must_finish_on' | 'asap' | 'alap';

export type TaskDependency = {
  id: string;
  tenantId: string;
  projectId: string;
  predecessorTaskId: string;
  successorTaskId: string;
  type: DependencyType;
  lagDays: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ResourceAllocation = {
  resourceId: string;
  resourceName: string;
  allocationPercent: number;
};

export type GanttTask = {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  milestone?: boolean;
  constraintType?: TaskConstraintType;
  constraintDate?: string | null;
  assignedResources: ResourceAllocation[];
};

export type CriticalPathTask = GanttTask & {
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  freeFloat: number;
  critical: boolean;
};

export type CriticalPathResult = {
  tasks: CriticalPathTask[];
  projectDurationDays: number;
  criticalPathTaskIds: string[];
  overAllocatedResources: Array<{
    resourceId: string;
    resourceName: string;
    date: string;
    totalAllocationPercent: number;
  }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(iso: string): Date {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ISO date: ${iso}`);
  return parsed;
}

function dayDiff(startIso: string, endIso: string) {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS) || 1);
}

function addDays(iso: string, days: number) {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function buildGraph(tasks: GanttTask[], deps: TaskDependency[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const incoming = new Map<string, TaskDependency[]>();
  const outgoing = new Map<string, TaskDependency[]>();

  for (const task of tasks) {
    incoming.set(task.id, []);
    outgoing.set(task.id, []);
  }

  for (const dep of deps) {
    if (!byId.has(dep.predecessorTaskId) || !byId.has(dep.successorTaskId)) continue;
    incoming.get(dep.successorTaskId)?.push(dep);
    outgoing.get(dep.predecessorTaskId)?.push(dep);
  }

  return { incoming, outgoing };
}

function topologicalOrder(tasks: GanttTask[], deps: TaskDependency[]) {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const task of tasks) {
    indegree.set(task.id, 0);
    outgoing.set(task.id, []);
  }

  for (const dep of deps) {
    if (!indegree.has(dep.successorTaskId) || !indegree.has(dep.predecessorTaskId)) continue;
    indegree.set(dep.successorTaskId, (indegree.get(dep.successorTaskId) || 0) + 1);
    outgoing.get(dep.predecessorTaskId)?.push(dep.successorTaskId);
  }

  const queue = Array.from(indegree.entries())
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);

  const ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of outgoing.get(id) || []) {
      const nextDegree = (indegree.get(next) || 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }

  if (ordered.length !== tasks.length) throw new Error('Task dependencies contain a cycle.');
  return ordered;
}

function dependencyConstraint(
  predecessor: CriticalPathTask,
  successor: CriticalPathTask,
  dep: TaskDependency,
  mode: 'forward' | 'backward',
) {
  const lag = dep.lagDays || 0;
  if (mode === 'forward') {
    if (dep.type === 'finish_to_start') return predecessor.earlyFinish + lag;
    if (dep.type === 'start_to_start') return predecessor.earlyStart + lag;
    return predecessor.earlyFinish + lag - successor.durationDays;
  }

  if (dep.type === 'finish_to_start') return successor.lateStart - lag;
  if (dep.type === 'start_to_start') return successor.lateStart - lag;
  return successor.lateFinish - lag;
}

function applyForwardConstraint(task: CriticalPathTask, projectStart: Date) {
  if (!task.constraintType || !task.constraintDate) return;
  const constraintDate = parseIsoDate(task.constraintDate);
  const offset = Math.ceil((constraintDate.getTime() - projectStart.getTime()) / DAY_MS);

  if (task.constraintType === 'must_start_on') {
    task.earlyStart = offset;
    task.earlyFinish = task.earlyStart + task.durationDays;
  }

  if (task.constraintType === 'must_finish_on') {
    task.earlyFinish = offset;
    task.earlyStart = task.earlyFinish - task.durationDays;
  }
}

export function calculateCriticalPath(
  tasks: GanttTask[],
  deps: TaskDependency[],
): CriticalPathResult {
  if (!tasks.length)
    return {
      tasks: [],
      projectDurationDays: 0,
      criticalPathTaskIds: [],
      overAllocatedResources: [],
    };

  const normalized = tasks.map((task) => ({
    ...task,
    durationDays: task.durationDays || dayDiff(task.startDate, task.endDate),
  }));
  const projectStart = normalized
    .map((task) => parseIsoDate(task.startDate).getTime())
    .reduce((min, val) => Math.min(min, val), Number.MAX_SAFE_INTEGER);

  const taskMap = new Map<string, CriticalPathTask>(
    normalized.map((task) => [
      task.id,
      {
        ...task,
        earlyStart: 0,
        earlyFinish: task.durationDays,
        lateStart: 0,
        lateFinish: 0,
        totalFloat: 0,
        freeFloat: 0,
        critical: false,
      },
    ]),
  );

  const { incoming, outgoing } = buildGraph(normalized, deps);
  const order = topologicalOrder(normalized, deps);

  for (const taskId of order) {
    const task = taskMap.get(taskId)!;
    let earliest = 0;

    for (const dep of incoming.get(taskId) || []) {
      const predecessor = taskMap.get(dep.predecessorTaskId)!;
      earliest = Math.max(earliest, dependencyConstraint(predecessor, task, dep, 'forward'));
    }

    task.earlyStart = Math.max(task.earlyStart, earliest);
    task.earlyFinish = task.earlyStart + task.durationDays;
    applyForwardConstraint(task, new Date(projectStart));
  }

  const projectDurationDays = Math.max(
    ...Array.from(taskMap.values()).map((task) => task.earlyFinish),
    0,
  );

  for (const taskId of [...order].reverse()) {
    const task = taskMap.get(taskId)!;
    const dependents = outgoing.get(taskId) || [];

    if (!dependents.length) {
      task.lateFinish = projectDurationDays;
      task.lateStart = task.lateFinish - task.durationDays;
    } else {
      let latest = Number.POSITIVE_INFINITY;
      for (const dep of dependents) {
        const successor = taskMap.get(dep.successorTaskId)!;
        latest = Math.min(latest, dependencyConstraint(task, successor, dep, 'backward'));
      }
      task.lateFinish = Number.isFinite(latest) ? latest : projectDurationDays;
      task.lateStart = task.lateFinish - task.durationDays;
    }

    task.totalFloat = task.lateStart - task.earlyStart;
    const dependentStart = dependents.map(
      (dep) => taskMap.get(dep.successorTaskId)!.earlyStart - (dep.lagDays || 0),
    );
    task.freeFloat =
      (dependentStart.length ? Math.min(...dependentStart) : task.earlyFinish) - task.earlyFinish;
    task.critical = task.totalFloat <= 0;
  }

  const overAllocatedResources = detectOverAllocation(Array.from(taskMap.values()));

  return {
    tasks: Array.from(taskMap.values()),
    projectDurationDays,
    criticalPathTaskIds: Array.from(taskMap.values())
      .filter((task) => task.critical)
      .map((task) => task.id),
    overAllocatedResources,
  };
}

export function optimizeSchedule(tasks: GanttTask[], deps: TaskDependency[]): GanttTask[] {
  const critical = calculateCriticalPath(tasks, deps);
  const byId = new Map(critical.tasks.map((task) => [task.id, task]));

  return tasks.map((task) => {
    const cp = byId.get(task.id);
    if (!cp || cp.critical || cp.constraintType === 'alap') return task;
    const shift = Math.max(0, Math.min(cp.totalFloat, 2));
    return {
      ...task,
      startDate: addDays(task.startDate, shift),
      endDate: addDays(task.endDate, shift),
    };
  });
}

export function levelResources(tasks: GanttTask[], deps: TaskDependency[]) {
  const optimized = optimizeSchedule(tasks, deps);
  return {
    tasks: optimized,
    overAllocatedResources: detectOverAllocation(optimized),
  };
}

function detectOverAllocation(
  tasks: Array<Pick<GanttTask, 'startDate' | 'endDate' | 'assignedResources'>>,
) {
  const map = new Map<
    string,
    { resourceId: string; resourceName: string; date: string; totalAllocationPercent: number }
  >();

  for (const task of tasks) {
    const start = parseIsoDate(task.startDate);
    const end = parseIsoDate(task.endDate);

    for (let at = start.getTime(); at <= end.getTime(); at += DAY_MS) {
      const date = new Date(at).toISOString().slice(0, 10);
      for (const resource of task.assignedResources || []) {
        const key = `${resource.resourceId}:${date}`;
        const existing = map.get(key) || {
          resourceId: resource.resourceId,
          resourceName: resource.resourceName,
          date,
          totalAllocationPercent: 0,
        };
        existing.totalAllocationPercent += resource.allocationPercent;
        map.set(key, existing);
      }
    }
  }

  return Array.from(map.values()).filter((entry) => entry.totalAllocationPercent > 100);
}
