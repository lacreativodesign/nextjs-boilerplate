import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireFinance } from '@/app/api/finance/_utils';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { adminDb } from '@/lib/firebaseAdmin';
import { calculateTax, isClientTaxExempt, TaxExemption } from '@/lib/finance/tax';
import { logError } from '@/lib/logging';
import { checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

const calculateTaxSchema = z.object({
  subtotal: z.number().min(0),
  clientId: z.string().optional(),
  taxRateId: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, 'standard', auth.user.uid);

    const body = await req.json();
    const validated = calculateTaxSchema.parse(body);

    let taxRate = 0;
    let taxRateName = 'No Tax';
    let isExempt = false;

    if (validated.clientId) {
      const exemptionsSnap = await adminDb
        .collection('tax_exemptions')
        .where('tenantId', '==', auth.user.tenantId)
        .where('clientId', '==', validated.clientId)
        .where('isActive', '==', true)
        .get();

      const exemptions = exemptionsSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          clientId: String(data.clientId || ''),
          exemptionType: data.exemptionType === 'partial' ? 'partial' : 'full',
          exemptionReason: String(data.exemptionReason || ''),
          exemptionCertificate: data.exemptionCertificate
            ? String(data.exemptionCertificate)
            : undefined,
          taxTypes: Array.isArray(data.taxTypes) ? data.taxTypes : [],
          isActive: Boolean(data.isActive),
          expiresAt:
            data.expiresAt && typeof data.expiresAt.toDate === 'function'
              ? data.expiresAt.toDate()
              : data.expiresAt instanceof Date
                ? data.expiresAt
                : undefined,
          tenantId: String(data.tenantId || ''),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as TaxExemption;
      });

      isExempt =
        exemptions.some((exemption) => exemption.exemptionType === 'full') ||
        isClientTaxExempt(exemptions, validated.clientId, 'sales_tax') ||
        isClientTaxExempt(exemptions, validated.clientId, 'vat') ||
        isClientTaxExempt(exemptions, validated.clientId, 'gst') ||
        isClientTaxExempt(exemptions, validated.clientId, 'hst') ||
        isClientTaxExempt(exemptions, validated.clientId, 'pst') ||
        isClientTaxExempt(exemptions, validated.clientId, 'qst') ||
        isClientTaxExempt(exemptions, validated.clientId, 'custom');
    }

    if (!isExempt) {
      let taxRateDoc:
        | FirebaseFirestore.QueryDocumentSnapshot
        | FirebaseFirestore.DocumentSnapshot
        | null = null;

      if (validated.taxRateId) {
        const selectedRateDoc = await adminDb
          .collection('tax_rates')
          .doc(validated.taxRateId)
          .get();
        if (!selectedRateDoc.exists) {
          throw new AppError({ message: 'Tax rate not found', code: 'NOT_FOUND', status: 404 });
        }
        const selectedRateData = selectedRateDoc.data();
        if (!selectedRateData || selectedRateData.tenantId !== auth.user.tenantId) {
          throw new AppError({ message: 'Forbidden', code: 'FORBIDDEN', status: 403 });
        }
        taxRateDoc = selectedRateDoc;
      } else {
        let query: FirebaseFirestore.Query = adminDb
          .collection('tax_rates')
          .where('tenantId', '==', auth.user.tenantId)
          .where('isActive', '==', true);

        if (validated.country) {
          query = query.where('country', '==', validated.country.toUpperCase());
        }

        const ratesSnap = await query.get();
        if (ratesSnap.empty) {
          const defaultSnap = await adminDb
            .collection('tax_rates')
            .where('tenantId', '==', auth.user.tenantId)
            .where('isDefault', '==', true)
            .where('isActive', '==', true)
            .limit(1)
            .get();

          if (!defaultSnap.empty) {
            taxRateDoc = defaultSnap.docs[0];
          }
        } else if (validated.region) {
          const regionMatch = ratesSnap.docs.find(
            (doc) =>
              String(doc.data().region || '').toUpperCase() === validated.region?.toUpperCase(),
          );
          taxRateDoc = regionMatch || ratesSnap.docs[0];
        } else {
          taxRateDoc = ratesSnap.docs[0];
        }
      }

      if (taxRateDoc?.exists) {
        const rateData = taxRateDoc.data();
        if (rateData) {
          taxRate = Number(rateData.rate || 0);
          taxRateName = String(rateData.name || 'Tax');
        }
      }
    }

    const calculation = calculateTax(validated.subtotal, taxRate);

    return NextResponse.json({
      ok: true,
      ...calculation,
      taxRateName,
      isExempt,
    });
  } catch (err) {
    logError(err, { route: 'POST /api/finance/tax/calculate' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Tax calculation failed',
    });
    return NextResponse.json(body, { status });
  }
}
