export type ResourceType = 'employee' | 'equipment' | 'material';

export type ProductionResource = {
  id: string;
  tenantId: string;
  type: ResourceType;
  name: string;
  capacityHoursPerDay: number;
  availabilityPercent: number;
  hourlyRate: number;
  active: boolean;
};

export type ResourceAssignment = {
  id: string;
  tenantId: string;
  projectId: string;
  projectName?: string;
  taskId: string;
  taskName?: string;
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
  allocationHoursPerDay: number;
  startDate: string;
  endDate: string;
  hourlyRate: number;
  status: 'active' | 'cancelled' | 'completed';
};

export type ResourceDayLoad = {
  date: string;
  capacityHours: number;
  allocatedHours: number;
  availableHours: number;
  utilizationPercent: number;
  overAllocated: boolean;
};

export type ResourceWorkload = {
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  totalCapacityHours: number;
  totalAllocatedHours: number;
  utilizationPercent: number;
  overAllocatedDays: number;
  days: ResourceDayLoad[];
  assignments: ResourceAssignment[];
};

export type OverAllocationWarning = {
  resourceId: string;
  resourceName: string;
  date: string;
  allocatedHours: number;
  capacityHours: number;
  overflowHours: number;
};

export type LevelingSuggestion = {
  sourceResourceId: string;
  sourceResourceName: string;
  targetResourceId: string;
  targetResourceName: string;
  date: string;
  transferableHours: number;
  reason: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(date: string): Date {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  parsed.setUTCHours(0, 0, 0, 0);
  return parsed;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function overlapRange(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): { start: Date; end: Date } | null {
  const start = startA.getTime() > startB.getTime() ? startA : startB;
  const end = endA.getTime() < endB.getTime() ? endA : endB;
  if (start.getTime() > end.getTime()) return null;
  return { start, end };
}

export function getDateRangeDays(startDate: string, endDate: string): string[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const days: string[] = [];
  for (let at = start.getTime(); at <= end.getTime(); at += DAY_MS) {
    days.push(toIsoDate(new Date(at)));
  }
  return days;
}

export function calculateResourceWorkload(
  resource: ProductionResource,
  assignments: ResourceAssignment[],
  rangeStartDate: string,
  rangeEndDate: string,
): ResourceWorkload {
  const rangeDays = getDateRangeDays(rangeStartDate, rangeEndDate);
  const start = parseIsoDate(rangeStartDate);
  const end = parseIsoDate(rangeEndDate);

  const resourceAssignments = assignments.filter(
    (assignment) => assignment.resourceId === resource.id && assignment.status === 'active',
  );

  const dailyAllocated = new Map<string, number>();
  for (const day of rangeDays) dailyAllocated.set(day, 0);

  for (const assignment of resourceAssignments) {
    const assignmentStart = parseIsoDate(assignment.startDate);
    const assignmentEnd = parseIsoDate(assignment.endDate);
    const overlap = overlapRange(start, end, assignmentStart, assignmentEnd);
    if (!overlap) continue;

    for (let at = overlap.start.getTime(); at <= overlap.end.getTime(); at += DAY_MS) {
      const day = toIsoDate(new Date(at));
      dailyAllocated.set(day, (dailyAllocated.get(day) || 0) + assignment.allocationHoursPerDay);
    }
  }

  const capacityPerDay =
    (Math.max(0, resource.capacityHoursPerDay) * Math.max(0, resource.availabilityPercent)) / 100;
  const days = rangeDays.map((date) => {
    const allocatedHours = dailyAllocated.get(date) || 0;
    const availableHours = Math.max(0, capacityPerDay - allocatedHours);
    const utilizationPercent = capacityPerDay > 0 ? (allocatedHours / capacityPerDay) * 100 : 0;

    return {
      date,
      capacityHours: capacityPerDay,
      allocatedHours,
      availableHours,
      utilizationPercent,
      overAllocated: allocatedHours > capacityPerDay || allocatedHours > 8,
    };
  });

  const totalCapacityHours = days.reduce((sum, day) => sum + day.capacityHours, 0);
  const totalAllocatedHours = days.reduce((sum, day) => sum + day.allocatedHours, 0);

  return {
    resourceId: resource.id,
    resourceName: resource.name,
    resourceType: resource.type,
    totalCapacityHours,
    totalAllocatedHours,
    utilizationPercent:
      totalCapacityHours > 0 ? (totalAllocatedHours / totalCapacityHours) * 100 : 0,
    overAllocatedDays: days.filter((day) => day.overAllocated).length,
    days,
    assignments: resourceAssignments,
  };
}

export function calculateAvailableCapacity(
  resources: ProductionResource[],
  assignments: ResourceAssignment[],
  rangeStartDate: string,
  rangeEndDate: string,
) {
  return resources
    .filter((resource) => resource.active)
    .map((resource) =>
      calculateResourceWorkload(resource, assignments, rangeStartDate, rangeEndDate),
    );
}

export function detectOverAllocation(workloads: ResourceWorkload[]): OverAllocationWarning[] {
  const warnings: OverAllocationWarning[] = [];
  for (const workload of workloads) {
    for (const day of workload.days) {
      if (!day.overAllocated) continue;
      const thresholdCapacity = Math.min(day.capacityHours, 8);
      warnings.push({
        resourceId: workload.resourceId,
        resourceName: workload.resourceName,
        date: day.date,
        allocatedHours: day.allocatedHours,
        capacityHours: day.capacityHours,
        overflowHours: Math.max(0, day.allocatedHours - thresholdCapacity),
      });
    }
  }
  return warnings;
}

export function suggestResourceLeveling(workloads: ResourceWorkload[]): LevelingSuggestion[] {
  const suggestions: LevelingSuggestion[] = [];

  const byType = new Map<ResourceType, ResourceWorkload[]>();
  for (const workload of workloads) {
    const list = byType.get(workload.resourceType) || [];
    list.push(workload);
    byType.set(workload.resourceType, list);
  }

  for (const [type, typeWorkloads] of byType.entries()) {
    const daySet = new Set<string>();
    for (const workload of typeWorkloads) {
      for (const day of workload.days) daySet.add(day.date);
    }

    for (const date of daySet) {
      const overloaded = typeWorkloads
        .map((w) => ({
          workload: w,
          day: w.days.find((d) => d.date === date),
        }))
        .filter((entry) => entry.day && entry.day.overAllocated) as Array<{
        workload: ResourceWorkload;
        day: ResourceDayLoad;
      }>;

      if (!overloaded.length) continue;

      const candidates = typeWorkloads
        .map((w) => ({
          workload: w,
          day: w.days.find((d) => d.date === date),
        }))
        .filter((entry) => entry.day && entry.day.availableHours > 0) as Array<{
        workload: ResourceWorkload;
        day: ResourceDayLoad;
      }>;

      for (const source of overloaded) {
        const bestTarget = candidates
          .filter((candidate) => candidate.workload.resourceId !== source.workload.resourceId)
          .sort((a, b) => b.day.availableHours - a.day.availableHours)[0];

        if (!bestTarget) continue;

        const transferableHours = Math.min(
          source.day.allocatedHours - Math.min(source.day.capacityHours, 8),
          bestTarget.day.availableHours,
        );

        if (transferableHours <= 0) continue;

        suggestions.push({
          sourceResourceId: source.workload.resourceId,
          sourceResourceName: source.workload.resourceName,
          targetResourceId: bestTarget.workload.resourceId,
          targetResourceName: bestTarget.workload.resourceName,
          date,
          transferableHours,
          reason: `Rebalance ${type} workload to avoid over-allocation.`,
        });
      }
    }
  }

  return suggestions;
}
