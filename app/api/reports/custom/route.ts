import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { ReportBuilderService } from '@/lib/reports/report-builder';
import type { Report, ReportFilter } from '@/types/reports';
import { requireReportsUser } from './_utils';

export const runtime = 'nodejs';

const filterSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    'equals',
    'notEquals',
    'greaterThan',
    'greaterThanOrEqual',
    'lessThan',
    'lessThanOrEqual',
    'between',
    'in',
    'notIn',
    'contains',
    'notContains',
    'startsWith',
    'endsWith',
    'isNull',
    'isNotNull',
  ]),
  value: z.any(),
  logicalOperator: z.enum(['and', 'or']).optional(),
});

const createReportSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  category: z.enum(['financial', 'sales', 'operations', 'inventory', 'hr', 'custom']),
  dataSource: z.enum(ReportBuilderService.getAvailableDataSources() as [string, ...string[]]),
  fields: z
    .array(
      z.object({
        field: z.string().min(1),
        label: z.string().min(1),
        alias: z.string().optional(),
        type: z.enum(['string', 'number', 'boolean', 'date', 'array', 'object']).optional(),
        selectedAt: z.number().int(),
      }),
    )
    .default([]),
  filters: z.array(filterSchema).default([]),
  groupBy: z.array(z.string()).default([]),
  aggregations: z
    .array(
      z.object({
        field: z.string().min(1),
        function: z.enum(['sum', 'avg', 'count', 'min', 'max']),
        alias: z.string().optional(),
      }),
    )
    .default([]),
  sorts: z
    .array(
      z.object({
        field: z.string().min(1),
        direction: z.enum(['asc', 'desc']),
      }),
    )
    .default([]),
  chartType: z.enum(['line', 'bar', 'pie', 'area', 'scatter', 'table', 'metric']).default('table'),
  chartConfig: z
    .object({
      xAxis: z.string().optional(),
      yAxis: z.array(z.string()).optional(),
      series: z.array(z.string()).optional(),
      showLegend: z.boolean().optional(),
      showGrid: z.boolean().optional(),
      stacked: z.boolean().optional(),
      colors: z.array(z.string()).optional(),
    })
    .optional(),
  isPublic: z.boolean().default(false),
  sharedWith: z.array(z.string()).default([]),
  snapshotRetentionDays: z.number().int().min(1).max(365).default(30),
});

export async function POST(request: NextRequest) {
  try {
    const { user, tenantId } = await requireReportsUser(request);
    const payload = createReportSchema.parse(await request.json());
    const now = admin.firestore.Timestamp.now();

    const report: Omit<Report, 'id'> = {
      tenantId,
      createdBy: user.uid,
      type: 'custom',
      name: payload.name,
      description: payload.description,
      category: payload.category,
      dataSource: payload.dataSource as Report['dataSource'],
      fields: payload.fields,
      filters: (payload.filters as ReportFilter[] | undefined) ?? [],
      groupBy: payload.groupBy,
      aggregations: payload.aggregations,
      sorts: payload.sorts,
      chartType: payload.chartType,
      chartConfig: payload.chartConfig,
      isScheduled: false,
      isPublic: payload.isPublic,
      sharedWith: payload.sharedWith,
      snapshotRetentionDays: payload.snapshotRetentionDays,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection('reports').add(report);
    return NextResponse.json({ id: ref.id, ...report }, { status: 201 });
  } catch (error: any) {
    const message = error?.message || 'Failed to create custom report';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { user, tenantId } = await requireReportsUser(request);

    const baseQuery = adminDb
      .collection('reports')
      .where('tenantId', '==', tenantId)
      .where('type', '==', 'custom');

    const [mine, shared, publicReports] = await Promise.all([
      baseQuery.where('createdBy', '==', user.uid).get(),
      baseQuery.where('sharedWith', 'array-contains', user.uid).get(),
      baseQuery.where('isPublic', '==', true).get(),
    ]);

    const records = [...mine.docs, ...shared.docs, ...publicReports.docs].map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    const reports = Array.from(new Map(records.map((entry) => [entry.id, entry])).values());

    return NextResponse.json({ reports });
  } catch (error: any) {
    const message = error?.message || 'Failed to list custom reports';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
