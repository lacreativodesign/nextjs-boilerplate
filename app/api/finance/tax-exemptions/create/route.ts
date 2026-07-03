import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireFinance, serverTimestamp } from '@/app/api/finance/_utils';
import { resolveErrorResponse } from '@/lib/errors';
import { adminDb } from '@/lib/firebaseAdmin';
import { logError } from '@/lib/logging';
import { checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

const createTaxExemptionSchema = z.object({
  clientId: z.string().min(1),
  exemptionType: z.enum(['full', 'partial']),
  exemptionReason: z.string().min(1),
  exemptionCertificate: z.string().url().optional(),
  taxTypes: z.array(z.enum(['sales_tax', 'vat', 'gst', 'hst', 'pst', 'qst', 'custom'])).min(1),
  isActive: z.boolean().default(true),
  expiresAt: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, 'standard', auth.user.uid);

    const body = await req.json();
    const validated = createTaxExemptionSchema.parse(body);

    const expiresAt = validated.expiresAt ? new Date(validated.expiresAt) : null;
    if (validated.expiresAt && (!expiresAt || Number.isNaN(expiresAt.getTime()))) {
      return NextResponse.json({ ok: false, error: 'Invalid expiresAt date' }, { status: 400 });
    }

    const docRef = adminDb.collection('tax_exemptions').doc();
    await docRef.set({
      clientId: validated.clientId,
      exemptionType: validated.exemptionType,
      exemptionReason: validated.exemptionReason,
      exemptionCertificate: validated.exemptionCertificate || null,
      taxTypes: validated.taxTypes,
      isActive: validated.isActive,
      expiresAt,
      tenantId: auth.user.tenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ ok: true, exemptionId: docRef.id });
  } catch (err) {
    logError(err, { route: 'POST /api/finance/tax-exemptions/create' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Failed to create tax exemption',
    });
    return NextResponse.json(body, { status });
  }
}
