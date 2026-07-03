import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireFinance, serverTimestamp } from '../../_utils';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';
import { checkRateLimit } from '@/lib/security';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateRecurringTemplateSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'paused', 'cancelled']).optional(),
  lineItems: z
    .array(
      z.object({
        id: z.string(),
        description: z.string().min(1),
        quantity: z.number().min(0.01),
        unitPrice: z.number().min(0),
        taxRate: z.number().min(0).max(100).optional(),
      }),
    )
    .optional(),
  notes: z.string().optional(),
  autoSend: z.boolean().optional(),
  dueDaysAfter: z.number().int().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, 'standard', auth.user.uid);

    const body = await req.json();
    const validated = updateRecurringTemplateSchema.parse(body);

    const docRef = adminDb.collection('recurring_invoice_templates').doc(validated.templateId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new AppError({
        message: 'Template not found',
        code: 'NOT_FOUND',
        status: 404,
      });
    }

    const existing = docSnap.data();
    if (!existing || existing.tenantId !== auth.user.tenantId) {
      throw new AppError({
        message: 'Forbidden',
        code: 'FORBIDDEN',
        status: 403,
      });
    }

    const updates: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    if (validated.name !== undefined) updates.name = validated.name;
    if (validated.description !== undefined) updates.description = validated.description;
    if (validated.status !== undefined) updates.status = validated.status;
    if (validated.lineItems !== undefined) updates.lineItems = validated.lineItems;
    if (validated.notes !== undefined) updates.notes = validated.notes;
    if (validated.autoSend !== undefined) updates.autoSend = validated.autoSend;
    if (validated.dueDaysAfter !== undefined) updates.dueDaysAfter = validated.dueDaysAfter;

    await docRef.update(updates);

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: 'POST /api/finance/recurring-invoices/update' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Failed to update recurring invoice template',
    });
    return NextResponse.json(body, { status });
  }
}
