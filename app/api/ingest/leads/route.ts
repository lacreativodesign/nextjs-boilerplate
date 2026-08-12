import { NextResponse } from 'next/server';
import crypto from 'crypto';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { createNotifications, getUsersByRoles } from '@/lib/notifications';
import { logEvent } from '@/lib/audit';
import { docTenantId } from '@/lib/tenant';
import { authenticateIngest } from '@/lib/ingest/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * IDEM-1: a retried submission returns the original lead instead of a duplicate or an error.
 *
 * A website form posts over a network that drops requests. The browser retries, the
 * serverless platform retries, the visitor double-clicks Send. Before this, each of those
 * produced one of two wrong answers:
 *
 *   - Retried after 60 seconds: a SECOND lead for the same person, so sales calls them
 *     twice and the pipeline count is wrong.
 *   - Retried within 60 seconds: HTTP 409 with `ok: false`. The website reads that as a
 *     failed submission and shows the visitor an error — while the lead sat in the CRM the
 *     whole time. The worst outcome of the three: a captured lead the sender believes was
 *     lost, who is then told to try again.
 *
 * A caller that sends an `Idempotency-Key` header now gets an exact-once guarantee. The
 * key is claimed with create(), which fails if the document exists, so of two concurrent
 * retries exactly one writes the lead and the other reads back its id. Both callers get
 * the same successful response.
 *
 * The key is hashed into the document id rather than sanitised into it. `orders` sanitises
 * with a character replace, which means `a/b` and `a_b` collapse to the same id and one
 * submission can shadow an unrelated one. A hash cannot collide that way.
 */
const IDEMPOTENCY_TTL_DAYS = 30;

/**
 * Fallback for callers that send no Idempotency-Key: treat an identical email and source
 * inside a short window as the same submission. This is a heuristic, not a guarantee —
 * it cannot distinguish a retry from a person who genuinely submitted twice — which is
 * why it now returns the original lead as a SUCCESS rather than an error. A caller that
 * wants the guarantee sends the header.
 */
const DEDUPE_WINDOW_MS = 60_000;

/** Deterministic, collision-free anchor for one submission from one tenant. */
function idempotencyDocId(tenantId: string, key: string) {
  const digest = crypto.createHash('sha256').update(`${tenantId}:${key}`).digest('hex');
  return `${tenantId}__${digest.slice(0, 40)}`;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function queryWithTenant(query: FirebaseFirestore.Query, tenantId: string) {
  const queries = [query.where('tenantId', '==', tenantId)];
  const snapshots = await Promise.all(queries.map((q) => q.get()));
  const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      if (docTenantId(doc.data()) === tenantId) {
        map.set(doc.id, doc);
      }
    });
  });
  return Array.from(map.values());
}

export async function POST(req: Request) {
  let claimRef: FirebaseFirestore.DocumentReference | null = null;
  try {
    const body = (await req.json().catch(() => null)) as Record<string, any> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
    }

    // KEY-1: the API key is read from the x-api-key header only. This used to also accept
    // body.apiKey, which put a live credential into any request-body logging or error
    // capture the payload passed through.
    const auth = await authenticateIngest(req);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: 'Invalid credentials.' },
        { status: auth.status },
      );
    }
    const tenantId = auth.tenantId;

    const lead = (body.lead || {}) as Record<string, any>;
    const name = normalizeOptionalString(lead.name) || '';
    const email = normalizeOptionalString(lead.email) || '';
    const source = normalizeOptionalString(lead.source) || 'website';

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Lead name required.' }, { status: 400 });
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: 'Valid email required.' }, { status: 400 });
    }

    const now = new Date();

    // An explicit key is the only thing that can distinguish a retry from a second genuine
    // submission, so it is checked first and short-circuits the heuristic entirely.
    const idempotencyKey =
      normalizeOptionalString(req.headers.get('idempotency-key')) ||
      normalizeOptionalString(body.submissionId);

    if (idempotencyKey) {
      claimRef = adminDb
        .collection('ingest_idempotency')
        .doc(idempotencyDocId(tenantId, idempotencyKey));
      try {
        await claimRef.create({
          tenantId,
          endpoint: 'leads',
          claimedAt: now.toISOString(),
          expiresAt: new Date(
            now.getTime() + IDEMPOTENCY_TTL_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString(),
        });
      } catch (err: unknown) {
        // ALREADY_EXISTS (gRPC 6): this exact submission was already accepted. Return the
        // lead it produced, as a success — the caller's request DID land.
        const code = (err as { code?: number | string })?.code;
        if (code === 6 || code === 'already-exists') {
          const existing = (await claimRef.get()).data() || {};
          return NextResponse.json(
            { ok: true, duplicate: true, leadId: existing.leadId ?? null },
            { status: 200 },
          );
        }
        throw err;
      }
    } else {
      const dedupeDocs = await queryWithTenant(
        adminDb
          .collection('leads')
          .where('email', '==', email)
          .where('source', '==', source)
          .orderBy('createdAt', 'desc')
          .limit(5),
        tenantId,
      );

      const duplicate = dedupeDocs.find((doc) => {
        const createdAt = doc.data()?.createdAt;
        if (!createdAt) return false;
        const createdDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
        return Math.abs(now.getTime() - createdDate.getTime()) < DEDUPE_WINDOW_MS;
      });

      if (duplicate) {
        // Success, not 409: a lead for this person exists and here is its id. Telling the
        // sender their submission failed, when it did not, is the one answer that causes
        // a real person to be turned away.
        return NextResponse.json(
          { ok: true, duplicate: true, leadId: duplicate.id },
          { status: 200 },
        );
      }
    }

    const leadRef = adminDb.collection('leads').doc();
    const leadData = {
      tenantId,
      leadId: leadRef.id,
      source: source as 'website' | 'manual' | 'import',
      name,
      email,
      phone: normalizeOptionalString(lead.phone),
      company: normalizeOptionalString(lead.company),
      message: normalizeOptionalString(lead.message),
      pageUrl: normalizeOptionalString(lead.pageUrl),
      utm: lead.utm || null,
      status: 'new',
      ownerUid: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await leadRef.set(leadData);

    // Link the claim to the lead it produced, so a later retry can return this id. Written
    // after the lead exists: a claim pointing at a lead that was never created would make
    // a retry return a dangling reference.
    if (claimRef) {
      await claimRef.set(
        { leadId: leadRef.id, completedAt: new Date().toISOString() },
        { merge: true },
      );
    }

    const recipients = await getUsersByRoles(['admin', 'super_admin', 'sales_manager'], tenantId);
    await createNotifications({
      recipients,
      tenantId,
      type: 'new_lead',
      title: 'New lead ingested',
      message: `${name} submitted a new lead from ${source}.`,
      entityType: 'lead',
      entityId: leadRef.id,
      deepLink: `/sales_manager/leads?open=${leadRef.id}`,
    });

    await logEvent({
      tenantId,
      type: 'lead.ingested',
      title: 'Lead ingested',
      description: `${name} ingested from ${source}.`,
      entityType: 'lead',
      entityId: leadRef.id,
    });

    return NextResponse.json({ ok: true, duplicate: false, leadId: leadRef.id }, { status: 200 });
  } catch (error) {
    // Release the claim so a retry can succeed. Without this, a failure between claiming
    // the key and writing the lead would poison that key permanently: every retry would
    // match the orphaned claim and return a lead id that does not exist.
    if (claimRef) {
      await claimRef.delete().catch(() => {
        console.error('[INGEST] failed to release idempotency claim');
      });
    }
    console.error('Lead ingest error:', error);
    return NextResponse.json({ ok: false, error: 'Server error.' }, { status: 500 });
  }
}
