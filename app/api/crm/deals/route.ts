import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireCrmUser, toIso } from '@/lib/crm';
import { DealService } from '@/lib/crm/deal-service';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';

export const dynamic = 'force-dynamic';

const createDealSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  customerId: z.string(),
  customerName: z.string(),
  value: z.number().min(0),
  currency: z.string().default('USD'),
  pipelineId: z.string(),
  stage: z.string(),
  expectedCloseDate: z.string(),
  source: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({
        message: auth.error,
        code: auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        status: auth.status,
      });
    }

    const body = await request.json();
    const validated = createDealSchema.safeParse(body);
    if (!validated.success) {
      throw new AppError({
        message: 'Deal details are invalid.',
        code: 'VALIDATION_ERROR',
        status: 400,
        details: validated.error.flatten(),
      });
    }

    const pipelineDoc = await adminDb.collection('pipelines').doc(validated.data.pipelineId).get();
    if (!pipelineDoc.exists) {
      throw new AppError({ message: 'Pipeline not found.', code: 'NOT_FOUND', status: 404 });
    }

    const pipelineData = pipelineDoc.data() as {
      tenantId?: string;
      name?: string;
      stages?: Array<{ id: string; name: string; order: number; probability: number }>;
    };

    if (pipelineData.tenantId !== auth.tenantId) {
      throw new AppError({ message: 'Pipeline not found.', code: 'NOT_FOUND', status: 404 });
    }

    const stage = pipelineData.stages?.find((entry) => entry.id === validated.data.stage);
    if (!stage) {
      throw new AppError({ message: 'Stage not found.', code: 'NOT_FOUND', status: 404 });
    }

    const dealId = await DealService.createDeal({
      tenantId: auth.tenantId,
      ...validated.data,
      pipelineName: pipelineData.name || 'Default Pipeline',
      stageName: stage.name,
      stageOrder: stage.order,
      probability: stage.probability,
      ownerId: auth.user.uid,
      ownerName: auth.user.name || auth.user.email || 'Unknown',
      expectedCloseDate: new Date(validated.data.expectedCloseDate),
    });

    return NextResponse.json({ dealId });
  } catch (error) {
    logError(error, { route: 'POST /api/crm/deals' });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to create deal.',
      context: { module: 'crm', operation: 'create-deal' },
    });
    return NextResponse.json(body, { status, headers });
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({
        message: auth.error,
        code: auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        status: auth.status,
      });
    }

    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage');
    const assignedSalesId = searchParams.get('assignedSalesId');

    const snap = await adminDb
      .collection('deals')
      .where('tenantId', '==', auth.tenantId)
      .orderBy('updatedAt', 'desc')
      .limit(500)
      .get();

    const deals = snap.docs
      .filter((doc) => {
        const data = doc.data();
        const owner = String(data.ownerId || data.assignedSalesId || '');
        if (auth.user.role === 'sales' && owner !== auth.user.uid) return false;
        if (stage && String(data.stage || '') !== stage) return false;
        if (assignedSalesId && owner !== assignedSalesId) return false;
        return true;
      })
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          leadId: String(data.leadId || data.customerId || ''),
          title: String(data.title || data.name || ''),
          valueUSD: Number(data.valueUSD || data.value || 0),
          stage: String(data.stage || 'new'),
          discountPercent: Number(data.discountPercent || 0),
          discountApproved: Boolean(data.discountApproved),
          assignedSalesId: String(data.assignedSalesId || data.ownerId || ''),
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
        };
      });

    return NextResponse.json({ ok: true, deals });
  } catch (error) {
    logError(error, { route: 'GET /api/crm/deals' });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to load deals.',
      context: { module: 'crm', operation: 'list-deals' },
    });
    return NextResponse.json(body, { status, headers });
  }
}
