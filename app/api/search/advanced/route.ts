import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { runAdvancedSearch } from '@/lib/search/advanced-search';

export const runtime = 'nodejs';

const filterSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    'equals',
    'contains',
    'greaterThan',
    'lessThan',
    'between',
    'in',
    'notEquals',
    'greaterThanOrEqual',
    'lessThanOrEqual',
  ]),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number()])),
  ]),
});

const bodySchema = z.object({
  collection: z.string().min(1),
  query: z.string().optional(),
  searchFields: z.array(z.string().min(1)).default([]),
  filters: z.array(filterSchema).default([]),
  logic: z.enum(['AND', 'OR']).default('AND'),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().int().min(1).max(200).default(100),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId || !session.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const result = await runAdvancedSearch({
      tenantId: session.tenantId,
      uid: session.uid,
      collection: data.collection,
      query: data.query,
      searchFields: data.searchFields,
      filters: data.filters,
      logic: data.logic,
      sortBy: data.sortBy,
      sortOrder: data.sortOrder,
      limit: data.limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Advanced search error', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
