import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { saveAdvancedSearch } from '@/lib/search/advanced-search';

export const runtime = 'nodejs';

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  collection: z.string().min(1),
  query: z.string().default(''),
  searchFields: z.array(z.string().min(1)).default([]),
  filters: z
    .array(
      z.object({
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
      }),
    )
    .default([]),
  logic: z.enum(['AND', 'OR']).default('AND'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId || !session.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const saved = await saveAdvancedSearch({
      tenantId: session.tenantId,
      uid: session.uid,
      name: data.name,
      collection: data.collection,
      query: data.query,
      searchFields: data.searchFields,
      filters: data.filters,
      logic: data.logic,
    });

    return NextResponse.json(saved);
  } catch (error) {
    console.error('Save advanced search error', error);
    return NextResponse.json({ error: 'Failed to save search' }, { status: 500 });
  }
}
