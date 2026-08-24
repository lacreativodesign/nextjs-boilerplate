import { NextResponse } from 'next/server';
import { getClientRecord, getInvoiceWithValidation, getTenantRecord } from '../shared';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { invoiceId: string } }) {
  try {
    const invoiceId = String(params.invoiceId || '').trim();
    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: 'Invoice id is required.' }, { status: 400 });
    }

    const token = new URL(req.url).searchParams.get('token');
    const validation = await getInvoiceWithValidation(invoiceId, token);
    if ('error' in validation) {
      return NextResponse.json(
        { ok: false, error: validation.error },
        { status: validation.status },
      );
    }

    if (String(validation.payload.status).toLowerCase() === 'paid') {
      return NextResponse.json({ ok: true, alreadyPaid: true, paidAt: validation.payload.paidAt });
    }

    const tenant = await getTenantRecord(validation.payload.tenantId);
    if (!tenant) {
      return NextResponse.json({ ok: false, error: 'Invoice not found' }, { status: 404 });
    }

    const client = await getClientRecord(validation.payload.clientId);

    return NextResponse.json({
      ok: true,
      invoice: {
        id: invoiceId,
        orderId: validation.payload.orderId,
        amount: validation.payload.amount,
        totalAmount: validation.payload.totalAmount,
        totalPaid: validation.payload.totalPaid,
        subtotal: validation.payload.subtotal,
        taxAmount: validation.payload.taxAmount,
        currency: validation.payload.currency,
        status: validation.payload.status,
        dueDate: validation.payload.dueDate,
        lineItems: validation.payload.lineItems,
        notes: validation.payload.notes,
      },
      tenant: {
        name: String((tenant.brand as { name?: string } | undefined)?.name || tenant.name || ''),
        logoUrl: String((tenant.brand as { logoUrl?: string } | undefined)?.logoUrl || '') || null,
        acceptsPayments: Boolean(
          tenant.stripeConnectAccountId && tenant.stripeConnectChargesEnabled,
        ),
        // Connect DIRECT charges require the PaymentMethod to be created on the
        // tenant's connected account, so the pay page must initialize Stripe.js
        // with this account id. Account ids are not secrets — this is Stripe's
        // documented client-side pattern for direct charges.
        stripeAccountId:
          tenant.stripeConnectAccountId && tenant.stripeConnectChargesEnabled
            ? String(tenant.stripeConnectAccountId)
            : null,
      },
      client: {
        companyName: client?.companyName ? String(client.companyName) : null,
        contactName: client?.primaryContactName ? String(client.primaryContactName) : null,
      },
    });
  } catch (error) {
    console.error('public invoice fetch error:', error);
    return NextResponse.json({ ok: false, error: 'Unable to load invoice.' }, { status: 500 });
  }
}
