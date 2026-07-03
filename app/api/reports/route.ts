import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUserOrThrow, getTenantIdForRequestOrThrow } from '@/lib/tenant/server';
import { requireModule, isPlanAccessError } from '@/app/lib/plan-enforcement';
import { PRESET_REPORTS } from '@/lib/reports/preset-reports';
import type { Report, ReportCategory } from '@/types/reports';
import { z } from 'zod';

export const runtime = 'nodejs';

const scheduleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1),
  enabled: z.boolean(),
});

const createReportSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.enum(['financial', 'sales', 'operations', 'inventory', 'hr', 'custom']),
  dataSource: z.enum([
    'invoices',
    'payments',
    'expenses',
    'customers',
    'products',
    'users',
    'audit_logs',
    'projects',
    'deals',
    'leads',
    'opportunities',
    'custom',
  ]),
  filters: z.array(z.any()).default([]),
  groupBy: z.array(z.string()).optional(),
  aggregations: z.array(z.any()).optional(),
  chartType: z.enum(['line', 'bar', 'pie', 'area', 'scatter', 'table', 'metric']).optional(),
  chartConfig: z.any().optional(),
  isPublic: z.boolean().default(false),
  sharedWith: z.array(z.string()).optional(),
  isScheduled: z.boolean().default(false),
  schedule: scheduleSchema.optional(),
  recipients: z.array(z.string().email()).optional(),
});

const roleCanAccessCategory = (role: string, category: ReportCategory) => {
  const normalized = (role || '').toLowerCase();
  if (category === 'financial') {
    return ['finance', 'admin', 'super_admin'].includes(normalized);
  }
  if (category === 'hr') {
    return ['hr', 'admin', 'super_admin'].includes(normalized);
  }
  return true;
};

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow(request);
    const tenantId = await getTenantIdForRequestOrThrow(request);
    await requireModule(tenantId, 'reports', { role: user.role });

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') as ReportCategory | null;
    const includePresets = searchParams.get('includePresets') === 'true';

    if (category && !roleCanAccessCategory(user.role, category)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const baseQuery = adminDb.collection('reports').where('tenantId', '==', tenantId);

    const applyCategory = (query: FirebaseFirestore.Query) => {
      if (category) {
        return query.where('category', '==', category);
      }
      return query;
    };

    const [ownedSnapshot, publicSnapshot, sharedSnapshot] = await Promise.all([
      applyCategory(baseQuery.where('createdBy', '==', user.uid)).get(),
      applyCategory(baseQuery.where('isPublic', '==', true)).get(),
      applyCategory(baseQuery.where('sharedWith', 'array-contains', user.uid)).get(),
    ]);

    const reports = [
      ...ownedSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      ...publicSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      ...sharedSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    ];

    const uniqueReports = Array.from(new Map(reports.map((r) => [r.id, r])).values()) as Report[];
    const filteredReports = uniqueReports.filter((report) =>
      roleCanAccessCategory(user.role, report.category),
    );

    let allReports: Array<Record<string, unknown>> = filteredReports as unknown as Array<
      Record<string, unknown>
    >;
    if (includePresets) {
      const presets = category
        ? PRESET_REPORTS[category] || []
        : Object.values(PRESET_REPORTS).flat();
      const allowedPresets = presets.filter((preset) =>
        roleCanAccessCategory(user.role, preset.category),
      );
      allReports = [...allowedPresets, ...filteredReports] as Array<Record<string, unknown>>;
    }

    return NextResponse.json({ reports: allReports });
  } catch (error: any) {
    if (isPlanAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error?.message || 'Failed to fetch reports';
    const status = message === 'Unauthorized' ? 401 : message === 'Tenant suspended' ? 403 : 500;
    console.error('Error fetching reports:', error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow(request);
    const tenantId = await getTenantIdForRequestOrThrow(request);
    await requireModule(tenantId, 'reports', { role: user.role });

    const body = await request.json();
    const data = createReportSchema.parse(body);

    if (!roleCanAccessCategory(user.role, data.category)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isPublic =
      data.isPublic && ['admin', 'super_admin'].includes((user.role || '').toLowerCase());
    const now = admin.firestore.Timestamp.now();

    const report: Omit<Report, 'id'> = {
      tenantId,
      createdBy: user.uid,
      type: 'custom',
      name: data.name,
      description: data.description,
      category: data.category,
      dataSource: data.dataSource,
      filters: data.filters,
      groupBy: data.groupBy,
      aggregations: data.aggregations,
      chartType: data.chartType,
      chartConfig: data.chartConfig,
      isScheduled: data.isScheduled,
      schedule: data.schedule,
      recipients: data.recipients,
      isPublic,
      sharedWith: data.sharedWith,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (report.isScheduled) {
      if (!report.schedule || !report.recipients?.length) {
        return NextResponse.json(
          { error: 'Schedule and recipients are required' },
          { status: 400 },
        );
      }
    }

    const docRef = await adminDb.collection('reports').add(report);

    return NextResponse.json({
      id: docRef.id,
      ...report,
    });
  } catch (error: any) {
    if (isPlanAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error creating report:', error);
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
  }
}
