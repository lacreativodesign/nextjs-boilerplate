import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCrmUser } from '@/lib/crm';
import { CustomerService } from '@/lib/crm/customer-service';
import { adminDb } from '@/lib/firebaseAdmin';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';

const createCustomerSchema = z.object({
  type: z.enum(['lead', 'prospect', 'customer', 'partner']),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  industry: z.string().optional(),
  leadSource: z.string().optional(),
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
    const validated = createCustomerSchema.safeParse(body);
    if (!validated.success) {
      throw new AppError({
        message: 'Customer details are invalid.',
        code: 'VALIDATION_ERROR',
        status: 400,
        details: validated.error.flatten(),
      });
    }

    const customerId = await CustomerService.createCustomer({
      tenantId: auth.tenantId,
      ...validated.data,
      ownerId: auth.user.uid,
      ownerName: auth.user.name || auth.user.email || 'Unknown',
    });

    return NextResponse.json({ customerId });
  } catch (error) {
    logError(error, { route: 'POST /api/crm/customers' });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to create customer.',
      context: { module: 'crm', operation: 'create-customer' },
    });
    return NextResponse.json(body, { status, headers });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({
        message: auth.error,
        code: auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        status: auth.status,
      });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const ownerId = searchParams.get('ownerId');

    let query: FirebaseFirestore.Query = adminDb
      .collection('customers')
      .where('tenantId', '==', auth.tenantId);

    if (type) query = query.where('type', '==', type);
    if (status) query = query.where('status', '==', status);
    if (ownerId) query = query.where('ownerId', '==', ownerId);

    const snapshot = await query.orderBy('createdAt', 'desc').limit(200).get();
    const customers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ customers });
  } catch (error) {
    logError(error, { route: 'GET /api/crm/customers' });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to load customers.',
      context: { module: 'crm', operation: 'list-customers' },
    });
    return NextResponse.json(body, { status, headers });
  }
}
