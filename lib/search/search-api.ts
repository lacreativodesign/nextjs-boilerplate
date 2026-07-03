import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SearchFilter, SearchModule } from '@/types/search';

const filterOperatorSchema = z.enum([
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'greaterThan',
  'lessThan',
  'greaterThanOrEqual',
  'lessThanOrEqual',
  'between',
  'in',
  'notIn',
  'isNull',
  'isNotNull',
]);

export const searchSchema = z.object({
  searchText: z.string().optional(),
  filters: z
    .array(
      z.object({
        field: z.string().min(1),
        operator: filterOperatorSchema,
        value: z.any(),
      }),
    )
    .optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(20),
  format: z.enum(['json', 'csv']).optional(),
});

export type SearchRequestParams = z.infer<typeof searchSchema>;

export type SearchModuleConfig = {
  module: SearchModule;
  collection: string;
  searchFields: string[];
  defaultSortBy?: string;
  allowedSortFields?: string[];
  csvFields?: string[];
};

export function validateFilters(filters: SearchFilter[] | undefined) {
  if (!filters) return null;
  for (const filter of filters) {
    if (filter.field === 'tenantId') {
      return 'Filtering by tenantId is not allowed.';
    }
    if (
      filter.operator === 'between' &&
      (!Array.isArray(filter.value) || filter.value.length !== 2)
    ) {
      return 'Between operator requires an array of two values.';
    }
    if ((filter.operator === 'in' || filter.operator === 'notIn') && !Array.isArray(filter.value)) {
      return 'In/notIn operators require an array of values.';
    }
  }
  return null;
}

export function validateSortField(sortBy: string | undefined, allowedSortFields?: string[]) {
  if (!sortBy || !allowedSortFields || allowedSortFields.length === 0) return null;
  if (!allowedSortFields.includes(sortBy)) {
    return `Sorting by ${sortBy} is not allowed.`;
  }
  return null;
}

export function toCsv(records: Array<Record<string, unknown>>, fields?: string[]) {
  const resolvedFields =
    fields && fields.length > 0
      ? fields
      : Array.from(
          records.reduce((acc, record) => {
            Object.keys(record).forEach((key) => acc.add(key));
            return acc;
          }, new Set<string>()),
        );

  const header = resolvedFields.join(',');
  const rows = records.map((record) =>
    resolvedFields
      .map((field) => {
        const value = record[field];
        if (value === null || value === undefined) return '';
        const raw = typeof value === 'string' ? value : JSON.stringify(value);
        return `"${raw.replace(/"/g, '""')}"`;
      })
      .join(','),
  );
  return [header, ...rows].join('\n');
}

export function csvResponse(payload: string, filename: string) {
  return new NextResponse(payload, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
