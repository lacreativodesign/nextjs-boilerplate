import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/cron/auth';
import { runDailyOrchestrator } from '@/lib/cron/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Keep the CRON_SECRET reference in the route so static route-contract checks can prove
  // this endpoint is authenticated even though the constant-time comparison is shared.
  const authorization = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!authorization.ok) {
    return NextResponse.json(
      { ok: false, error: authorization.code },
      { status: authorization.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const result = await runDailyOrchestrator();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'ORCHESTRATOR_STARTUP_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
