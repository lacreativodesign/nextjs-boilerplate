import { NextResponse } from 'next/server';
import { REQUIRED_ENV_VARS } from '@/lib/launch-checklist';
import { requireLaunchChecklistSuperAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireLaunchChecklistSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const envResults = REQUIRED_ENV_VARS.map((key) => ({
      key,
      configured: Boolean(process.env[key]),
    }));

    const configured = envResults.filter((r) => r.configured).length;
    const total = envResults.length;
    const allConfigured = configured === total;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const httpsEnabled = appUrl.startsWith('https://');

    const score =
      Math.round(
        ((configured / total) * 60 +
          (httpsEnabled ? 20 : 0) +
          (process.env.NEXT_PUBLIC_SENTRY_DSN ? 10 : 0) +
          (process.env.STRIPE_WEBHOOK_SECRET ? 10 : 0)) *
          100,
      ) / 100;

    return NextResponse.json({
      ok: true,
      score: Math.min(score, 100),
      allConfigured,
      configured,
      total,
      httpsEnabled,
      appUrl: appUrl || null,
      envResults,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
