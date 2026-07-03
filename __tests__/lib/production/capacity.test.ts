import {
  calculateAvailableCapacity,
  detectOverAllocation,
  suggestResourceLeveling,
  type ProductionResource,
  type ResourceAssignment,
} from '@/lib/production/capacity';

describe('production capacity planning', () => {
  const resources: ProductionResource[] = [
    {
      id: 'r1',
      tenantId: 't1',
      type: 'employee',
      name: 'Alice',
      capacityHoursPerDay: 8,
      availabilityPercent: 100,
      hourlyRate: 50,
      active: true,
    },
    {
      id: 'r2',
      tenantId: 't1',
      type: 'employee',
      name: 'Bob',
      capacityHoursPerDay: 8,
      availabilityPercent: 100,
      hourlyRate: 45,
      active: true,
    },
  ];

  const assignments: ResourceAssignment[] = [
    {
      id: 'a1',
      tenantId: 't1',
      projectId: 'p1',
      taskId: 'task1',
      resourceId: 'r1',
      resourceType: 'employee',
      resourceName: 'Alice',
      allocationHoursPerDay: 9,
      startDate: '2026-01-05',
      endDate: '2026-01-07',
      hourlyRate: 50,
      status: 'active',
    },
    {
      id: 'a2',
      tenantId: 't1',
      projectId: 'p1',
      taskId: 'task2',
      resourceId: 'r2',
      resourceType: 'employee',
      resourceName: 'Bob',
      allocationHoursPerDay: 3,
      startDate: '2026-01-05',
      endDate: '2026-01-07',
      hourlyRate: 45,
      status: 'active',
    },
  ];

  it('calculates workload and utilization', () => {
    const workloads = calculateAvailableCapacity(
      resources,
      assignments,
      '2026-01-05',
      '2026-01-07',
    );
    expect(workloads).toHaveLength(2);

    const alice = workloads.find((row) => row.resourceId === 'r1');
    expect(alice?.totalAllocatedHours).toBe(27);
    expect(alice?.overAllocatedDays).toBe(3);
  });

  it('detects over-allocation and proposes leveling', () => {
    const workloads = calculateAvailableCapacity(
      resources,
      assignments,
      '2026-01-05',
      '2026-01-07',
    );
    const warnings = detectOverAllocation(workloads);
    const suggestions = suggestResourceLeveling(workloads);

    expect(warnings.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].targetResourceId).toBe('r2');
  });
});
