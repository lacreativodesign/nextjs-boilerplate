import { NextRequest, NextResponse } from 'next/server';
import { batchImport } from '@/lib/import/batch-import';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { z } from 'zod';

const clientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const invoiceSchema = z.object({
  clientId: z.string(),
  invoiceNumber: z.string(),
  amount: z.number().or(z.string().transform(Number)),
  dueDate: z.string(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue']).optional(),
});

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  price: z.number().or(z.string().transform(Number)),
  description: z.string().optional(),
  stock: z.number().or(z.string().transform(Number)).optional(),
});

const projectSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().optional(),
  status: z.enum(['active', 'completed', 'on_hold']).optional(),
  budget: z.number().or(z.string().transform(Number)).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

function getSchemaForEntity(entityType: string): z.ZodSchema {
  const schemas: Record<string, z.ZodSchema> = {
    clients: clientSchema,
    invoices: invoiceSchema,
    products: productSchema,
    projects: projectSchema,
  };
  return schemas[entityType] || z.object({}).passthrough();
}

export async function POST(req: NextRequest) {
  // Require authenticated admin or super_admin — tenantId comes from session, not request body
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Use tenantId from the authenticated session — never trust client-supplied tenantId
  const tenantId = auth.user.tenantId as string;
  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant not found in session' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { entityType, rows, mapping } = body;

    if (!entityType || !rows || !mapping) {
      return NextResponse.json(
        { error: 'Missing required fields: entityType, rows, mapping' },
        { status: 400 },
      );
    }

    const schema = getSchemaForEntity(entityType);
    const validRows: any[] = [];
    const errors: { row: number; field: string; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped: any = {};

      for (const [systemField, fileField] of Object.entries(mapping)) {
        if (typeof fileField === 'string' && fileField !== '') {
          mapped[systemField] = row[fileField];
        }
      }

      const result = schema.safeParse(mapped);
      if (!result.success) {
        result.error.errors.forEach((err) => {
          errors.push({ row: i + 1, field: err.path.join('.'), error: err.message });
        });
      } else {
        validRows.push(result.data);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, errors, validCount: validRows.length, errorCount: errors.length },
        { status: 400 },
      );
    }

    const result = await batchImport(tenantId, entityType, validRows);

    return NextResponse.json({ success: true, imported: result.imported, total: result.total });
  } catch (error: any) {
    console.error('Import execute error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Import failed' },
      { status: 500 },
    );
  }
}
