import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, isAdminOrSuper } from '@/app/api/admin/_utils';
import { batchImport } from '@/lib/import/batch-import';
import { validateRows } from '@/lib/import/validator';
import { createClientSchema } from '@/lib/validations/client';
import { createInvoiceSchema } from '@/lib/validations/invoice';
import { createProjectSchema } from '@/lib/validations/project';
import { createEmployeeSchema } from '@/lib/validations/employee';

export const runtime = 'nodejs';

const requestSchema = z.object({
  tenantId: z.string().trim().min(1),
  entityType: z.enum(['clients', 'invoices', 'projects', 'employees']),
  rows: z.array(z.record(z.unknown())),
  mapping: z.record(z.string()),
  dryRun: z.boolean().optional().default(false),
  importJobId: z.string().trim().min(1).optional(),
});

function getSchemaForEntity(entityType: 'clients' | 'invoices' | 'projects' | 'employees') {
  switch (entityType) {
    case 'clients':
      return createClientSchema.omit({ tenantId: true });
    case 'invoices':
      return createInvoiceSchema.omit({ tenantId: true });
    case 'projects':
      return createProjectSchema.omit({ tenantId: true });
    case 'employees':
      return createEmployeeSchema.omit({ tenantId: true });
    default:
      throw new Error(`Unsupported entity type: ${entityType}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminOrSuper(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = requestSchema.parse(await req.json());

    if (payload.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'Tenant mismatch' }, { status: 403 });
    }

    const schema = getSchemaForEntity(payload.entityType);
    const { validRows, errors } = await validateRows(payload.rows, schema, payload.mapping);

    if (errors.length > 0) {
      return NextResponse.json({ errors, validRows: validRows.length }, { status: 400 });
    }

    if (payload.dryRun) {
      return NextResponse.json({ validRows: validRows.length, errors: [] });
    }

    const result = await batchImport({
      tenantId: payload.tenantId,
      collection: payload.entityType,
      rows: validRows,
      importJobId: payload.importJobId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: error.flatten() },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : 'Failed to import rows';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
