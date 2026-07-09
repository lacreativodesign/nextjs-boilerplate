import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin, serverTimestamp } from '../_utils';
import { encryptApiKey, decryptApiKey } from '@/lib/ai/byok-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STARTER_LOCKED_PLANS = new Set(['starter', 'trial']);

function maskKey(key: string): string {
  if (!key || key.length < 8) return '•'.repeat(key.length || 8);
  return key.slice(0, 7) + '...' + key.slice(-4);
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    // Check plan
    const tenantSnap = await adminDb.collection('tenants').doc(auth.user.tenantId).get();
    const plan = String(tenantSnap.data()?.plan || 'starter');
    const planLocked = STARTER_LOCKED_PLANS.has(plan);

    if (planLocked) {
      return NextResponse.json({ ok: true, planLocked: true, plan });
    }

    const snap = await adminDb
      .collection('tenants')
      .doc(auth.user.tenantId)
      .collection('settings')
      .doc('ai_workforce')
      .get();

    const data = snap.data() || {};

    return NextResponse.json({
      ok: true,
      planLocked: false,
      plan,
      settings: {
        provider: data.provider || null,
        apiKeyMasked: data.apiKey ? maskKey(decryptApiKey(String(data.apiKey))) : null,
        hasKey: Boolean(data.apiKey),
        updatedAt: data.updatedAt || null,
        updatedBy: data.updatedBy || null,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    // Check plan
    const tenantSnap = await adminDb.collection('tenants').doc(auth.user.tenantId).get();
    const plan = String(tenantSnap.data()?.plan || 'starter');
    if (STARTER_LOCKED_PLANS.has(plan)) {
      return NextResponse.json(
        { ok: false, error: 'AI Workforce requires Pro or Enterprise plan.' },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { provider, apiKey, removeKey } = body;

    if (removeKey) {
      await adminDb
        .collection('tenants')
        .doc(auth.user.tenantId)
        .collection('settings')
        .doc('ai_workforce')
        .set(
          {
            provider: null,
            apiKey: null,
            updatedAt: serverTimestamp(),
            updatedBy: auth.user.uid,
          },
          { merge: true },
        );
      return NextResponse.json({ ok: true, removed: true });
    }

    if (!provider || !['openai', 'anthropic'].includes(provider)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid provider. Must be openai or anthropic.' },
        { status: 400 },
      );
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 20) {
      return NextResponse.json({ ok: false, error: 'Invalid API key.' }, { status: 400 });
    }

    // Basic format validation
    const key = apiKey.trim();
    if (provider === 'openai' && !key.startsWith('sk-')) {
      return NextResponse.json(
        { ok: false, error: 'OpenAI API keys must start with sk-' },
        { status: 400 },
      );
    }
    if (provider === 'anthropic' && !key.startsWith('sk-ant-')) {
      return NextResponse.json(
        { ok: false, error: 'Anthropic API keys must start with sk-ant-' },
        { status: 400 },
      );
    }

    await adminDb
      .collection('tenants')
      .doc(auth.user.tenantId)
      .collection('settings')
      .doc('ai_workforce')
      .set(
        {
          provider,
          // Encrypted at rest (AES-256-GCM). Decrypted only server-side at call time.
          apiKey: encryptApiKey(key),
          updatedAt: serverTimestamp(),
          updatedBy: auth.user.uid,
        },
        { merge: true },
      );

    return NextResponse.json({ ok: true, provider, apiKeyMasked: maskKey(key) });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
