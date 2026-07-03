import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  calculateAvailableCapacity,
  detectOverAllocation,
  suggestResourceLeveling,
  type ProductionResource,
  type ResourceAssignment,
} from '@/lib/production/capacity';
import { asIsoDate, getResourcePlannerUser } from '../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function defaultRange() {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - start.getUTCDay() + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 27);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function GET(request: Request) {
  try {
    const auth = await getResourcePlannerUser();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { user } = auth;
    const { searchParams } = new URL(request.url);
    const range = defaultRange();
    const startDate = String(searchParams.get('startDate') || range.startDate).slice(0, 10);
    const endDate = String(searchParams.get('endDate') || range.endDate).slice(0, 10);

    const [resourceSnap, assignmentSnap] = await Promise.all([
      adminDb
        .collection('productionResources')
        .where('tenantId', '==', user.tenantId)
        .where('active', '==', true)
        .get(),
      adminDb
        .collection('productionResourceAssignments')
        .where('tenantId', '==', user.tenantId)
        .where('status', '==', 'active')
        .get(),
    ]);

    const resources: ProductionResource[] = resourceSnap.docs.map((doc) => {
      const data = doc.data() as any;
      return {
        id: String(data.resourceId || doc.id.replace(`${user.tenantId}_`, '')),
        tenantId: user.tenantId,
        type: data.type || 'employee',
        name: data.name || 'Unnamed resource',
        capacityHoursPerDay: Number(data.capacityHoursPerDay || 8),
        availabilityPercent: Number(data.availabilityPercent ?? 100),
        hourlyRate: Number(data.hourlyRate || 0),
        active: Boolean(data.active),
      };
    });

    const assignments: ResourceAssignment[] = assignmentSnap.docs.map((doc) => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        tenantId: user.tenantId,
        projectId: String(data.projectId || ''),
        projectName: String(data.projectName || ''),
        taskId: String(data.taskId || ''),
        taskName: String(data.taskName || ''),
        resourceId: String(data.resourceId || ''),
        resourceType: data.resourceType || 'employee',
        resourceName: String(data.resourceName || ''),
        allocationHoursPerDay: Number(data.allocationHoursPerDay || 0),
        startDate: asIsoDate(data.startDate) || startDate,
        endDate: asIsoDate(data.endDate) || endDate,
        hourlyRate: Number(data.hourlyRate || 0),
        status: data.status || 'active',
      };
    });

    const workloads = calculateAvailableCapacity(resources, assignments, startDate, endDate);
    const warnings = detectOverAllocation(workloads);
    const levelingSuggestions = suggestResourceLeveling(workloads);

    return NextResponse.json({
      ok: true,
      startDate,
      endDate,
      workloads,
      warnings,
      levelingSuggestions,
    });
  } catch (error) {
    console.error('GET /api/production/resources/workload', error);
    return NextResponse.json({ ok: false, error: 'Unable to load workload.' }, { status: 500 });
  }
}
