import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb as db } from '@/lib/firebaseAdmin';
import { logEvent } from '@/lib/audit';
import { docTenantId, normalizeTenantId } from '@/lib/tenant';
import { getCurrentUser } from '../../_utils';
import { normalizeOptionalSlug, normalizeSlugArray, slugify } from '@/lib/segments';
import { assertPermission, Permission } from '../../../../lib/permissions';
import { getClientIp } from '@/lib/security';
import { dispatchWebhookEvent } from '@/lib/webhooks/webhook-delivery';

export const dynamic = 'force-dynamic';

const PAYMENT_OWNED_FIELDS = [
  'paymentStatus',
  'totalPaidUsd',
  'openBalanceUsd',
  'paidAmount',
  'balanceDue',
  'paymentMethod',
  'paidAt',
  'firstPaymentAt',
  'orderId',
  'projectId',
  'projectCreated',
] as const;

function canEditClient(role: string) {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'super_admin' || normalized === 'admin' || normalized === 'sales_manager';
}

function cleanString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeEmail(value: unknown) {
  return cleanString(value).toLowerCase();
}

function toNumber(value: unknown) {
  const parsed = Number(
    String(value ?? '')
      .replace(/,/g, '')
      .trim(),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasOwn(record: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(record, field);
}

async function handleUpdate(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!canEditClient(me.role)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }
  try {
    assertPermission(me.role, Permission.EditClients);
  } catch {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const rawTenantId = String(me.tenantId || '').trim();
  if (!rawTenantId) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }
  const tenantId = normalizeTenantId(rawTenantId);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const id = cleanString(body.id || body.clientId);
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Client id is required' }, { status: 400 });
  }

  // Client profile editing is not a money path. These fields are derived from the canonical
  // invoice/payment/project lifecycle and must never be writable from a generic client form.
  const attemptedPaymentFields = PAYMENT_OWNED_FIELDS.filter((field) => hasOwn(body, field));
  if (attemptedPaymentFields.length) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Payment, balance, order and project state is read-only here. Record client payments through Finance/invoices.',
        code: 'payment_state_read_only',
        fields: attemptedPaymentFields,
      },
      { status: 409 },
    );
  }

  try {
    const ref = db.collection('clients').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
    }

    const existing = (snap.data() || {}) as Record<string, unknown>;
    if (docTenantId(existing) !== tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    if (existing.deletedAt) {
      return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
    }

    const existingEmail = cleanString(existing.primaryContactEmail);
    const existingEmailLower = normalizeEmail(existing.primaryContactEmail);
    const incomingEmail = cleanString(body.primaryContactEmail);
    if (incomingEmail && incomingEmail.toLowerCase() !== existingEmailLower) {
      return NextResponse.json(
        { ok: false, error: 'Primary contact email cannot be changed' },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.companyName !== undefined) updateData.companyName = cleanString(body.companyName);
    if (body.website !== undefined) updateData.website = cleanString(body.website);
    if (body.industry !== undefined) updateData.industry = cleanString(body.industry);
    if (body.businessType !== undefined) updateData.businessType = cleanString(body.businessType);
    if (body.country !== undefined) updateData.country = cleanString(body.country);
    if (body.city !== undefined) updateData.city = cleanString(body.city);
    if (body.timezone !== undefined) updateData.timezone = cleanString(body.timezone);
    if (body.employeeCountRange !== undefined) {
      updateData.employeeCountRange = cleanString(body.employeeCountRange) || null;
    }
    if (body.yearsInBusinessRange !== undefined) {
      updateData.yearsInBusinessRange = cleanString(body.yearsInBusinessRange) || null;
    }

    if (body.primaryContactName !== undefined) {
      updateData.primaryContactName = cleanString(body.primaryContactName);
    }
    if (body.primaryContactTitle !== undefined) {
      updateData.primaryContactTitle = cleanString(body.primaryContactTitle);
    }
    if (body.primaryContactEmail !== undefined) {
      updateData.primaryContactEmail = existingEmail;
      updateData.primaryContactEmailLower = existingEmailLower;
    }
    if (body.primaryContactPhone !== undefined) {
      updateData.primaryContactPhone = cleanString(body.primaryContactPhone);
    }

    if (body.salesStage !== undefined) updateData.salesStage = cleanString(body.salesStage);
    if (body.retainerStatus !== undefined) {
      updateData.retainerStatus = cleanString(body.retainerStatus);
    }

    if (body.salesOwner !== undefined) updateData.salesOwner = cleanString(body.salesOwner);
    if (body.accountManager !== undefined) {
      updateData.accountManager = cleanString(body.accountManager);
    }
    if (body.productionOwner !== undefined) {
      updateData.productionOwner = cleanString(body.productionOwner);
    }

    // Contract value is commercial profile metadata. Paid/open-balance values are deliberately
    // excluded above and may only be derived from canonical invoice/payment state.
    if (body.totalContractValueUsd !== undefined) {
      updateData.totalContractValueUsd = toNumber(body.totalContractValueUsd);
    }

    if (body.segmentServices !== undefined) {
      updateData.segmentServices = normalizeSlugArray(body.segmentServices);
    }
    if (body.segmentBusinessType !== undefined) {
      updateData.segmentBusinessType = normalizeOptionalSlug(body.segmentBusinessType);
    }
    if (body.segmentIndustry !== undefined) {
      updateData.segmentIndustry = normalizeOptionalSlug(body.segmentIndustry);
    }
    if (body.segmentGeo !== undefined) {
      updateData.segmentGeo = normalizeOptionalSlug(body.segmentGeo);
    } else if (body.country !== undefined) {
      const derivedGeo = slugify(cleanString(body.country));
      updateData.segmentGeo = derivedGeo || null;
    }

    updateData.primaryContactEmailLower = existingEmailLower;
    updateData.tenantId = tenantId;

    const now = admin.firestore.FieldValue.serverTimestamp();
    updateData.updatedAt = now;
    updateData.lastActivity = now;

    const changes = Object.entries(updateData)
      .filter(([field]) => !['updatedAt', 'lastActivity'].includes(field))
      .filter(([field, value]) => value !== existing[field])
      .map(([field, value]) => ({
        field,
        oldValue: existing[field],
        newValue: value,
      }));

    await ref.set(updateData, { merge: true });

    if (changes.length) {
      try {
        await logEvent({
          tenantId,
          type: 'client.updated',
          title: 'Client updated',
          description: `${existing.companyName || 'Client'} updated.`,
          entityType: 'client',
          entityId: id,
          actor: { uid: me.uid, name: me.name || me.fullName || '' },
          metadata: {
            ip: getClientIp(req),
            userAgent: req.headers.get('user-agent') || '',
          },
          audit: {
            action: 'update',
            resource: 'customer',
            resourceId: id,
            changes,
          },
        });
      } catch (auditError) {
        console.error('audit log error:', auditError);
      }
    }

    try {
      await dispatchWebhookEvent({
        tenantId,
        event: 'client.updated',
        entityType: 'client',
        entityId: id,
        payload: {
          clientId: id,
          companyName: String(updateData.companyName || existing.companyName || ''),
          changes,
          orderId: String(existing.orderId || ''),
        },
        actor: { uid: me.uid, email: me.email || null, role: me.role || null },
      });
    } catch (webhookError) {
      console.error('client.updated webhook dispatch error:', webhookError);
    }

    return NextResponse.json({ ok: true, id, orderId: String(existing.orderId || '') });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Failed to update client' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  return handleUpdate(req);
}

export async function POST(req: Request) {
  return handleUpdate(req);
}
