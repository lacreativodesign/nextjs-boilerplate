import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { createNotifications, getUsersByRoles } from '@/lib/notifications';
import { logEvent } from '@/lib/audit';
import { authenticateIngest } from '@/lib/ingest/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Resolve a client by email within the tenant, mirroring app/api/client/_utils.ts.
// Uses the existing (tenantId + primaryContactEmailLower / primaryContactEmail) indexes.
async function findClientByEmail(
  tenantId: string,
  email: string,
): Promise<{ id: string; name: string } | null> {
  const lower = email.toLowerCase();
  const byLower = await adminDb
    .collection('clients')
    .where('tenantId', '==', tenantId)
    .where('primaryContactEmailLower', '==', lower)
    .limit(1)
    .get();
  let candidate = byLower.empty ? null : byLower.docs[0];
  if (!candidate) {
    const byRaw = await adminDb
      .collection('clients')
      .where('tenantId', '==', tenantId)
      .where('primaryContactEmail', '==', email)
      .limit(1)
      .get();
    candidate = byRaw.empty ? null : byRaw.docs[0];
  }
  if (!candidate) return null;
  const data = candidate.data() || {};
  if (data.deletedAt) return null;
  const name = String(data.companyName || data.name || '').trim();
  return { id: candidate.id, name };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, any> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
    }

    const auth = await authenticateIngest(req, {
      fallbackApiKey: normalizeOptionalString(body.apiKey),
    });
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: 'Invalid credentials.' },
        { status: auth.status },
      );
    }
    const tenantId = auth.tenantId;

    const serviceType = normalizeOptionalString(body.serviceType);
    const clientEmailRaw = normalizeOptionalString(body.clientEmail);
    const clientEmail = clientEmailRaw ? clientEmailRaw.toLowerCase() : '';
    const clientNameInput = normalizeOptionalString(body.clientName);
    const projectName = normalizeOptionalString(body.projectName);
    const answers = body.answers;

    if (!serviceType) {
      return NextResponse.json({ ok: false, error: 'serviceType is required.' }, { status: 400 });
    }
    if (!clientEmail || !isValidEmail(clientEmail)) {
      return NextResponse.json(
        { ok: false, error: 'Valid clientEmail is required.' },
        { status: 400 },
      );
    }
    if (!isPlainObject(answers) || Object.keys(answers).length === 0) {
      return NextResponse.json(
        { ok: false, error: 'answers object is required.' },
        { status: 400 },
      );
    }

    const matchedClient = await findClientByEmail(tenantId, clientEmail);

    const briefRef = adminDb.collection('briefs').doc();
    const briefData = {
      tenantId,
      briefId: briefRef.id,
      serviceType,
      answers,
      clientEmail,
      clientName: matchedClient?.name || clientNameInput || null,
      clientId: matchedClient?.id || null,
      projectId: normalizeOptionalString(body.projectId),
      orderId: normalizeOptionalString(body.orderId),
      stripeSessionId: normalizeOptionalString(body.stripeSessionId),
      projectName,
      source: 'website',
      status: 'submitted',
      pageUrl: normalizeOptionalString(body.pageUrl),
      meta: isPlainObject(body.meta) ? body.meta : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await briefRef.set(briefData);

    const recipients = await getUsersByRoles(
      ['admin', 'super_admin', 'production_manager', 'am_manager'],
      tenantId,
    );
    await createNotifications({
      recipients,
      tenantId,
      type: 'info',
      title: 'New project brief',
      message: `${matchedClient?.name || clientEmail} submitted a ${serviceType} brief.`,
      entityType: matchedClient ? 'client' : null,
      entityId: matchedClient?.id || briefRef.id,
      deepLink: '/admin/clients',
    });

    await logEvent({
      tenantId,
      type: 'brief.ingested',
      title: 'Brief ingested',
      description: `${serviceType} brief submitted by ${clientEmail}.`,
      entityType: 'client',
      entityId: matchedClient?.id || briefRef.id,
    });

    return NextResponse.json(
      {
        ok: true,
        briefId: briefRef.id,
        clientId: matchedClient?.id || null,
        linkedClient: Boolean(matchedClient),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Brief ingest error:', error);
    return NextResponse.json({ ok: false, error: 'Server error.' }, { status: 500 });
  }
}
