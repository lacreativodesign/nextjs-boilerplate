import { NextResponse } from 'next/server';
import { verifySlackSignature } from '@/lib/integrations/slack';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get('x-slack-request-timestamp');
  const signature = request.headers.get('x-slack-signature');

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ ok: false, error: 'Invalid Slack signature.' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody || '{}');

  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge || '' });
  }

  return NextResponse.json({ ok: true });
}
