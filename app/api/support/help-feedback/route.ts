import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalizeTenantId } from '@/lib/tenant';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { isAppError, resolveErrorResponse } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Records two kinds of help-center signal, both keyed by the authenticated
 * session's tenantId (never the request body):
 *
 *  - 'article'    a Was-this-helpful yes/no vote on a specific article.
 *  - 'deflection' the bug reporter surfaced a matching article and the user said
 *                 it solved their problem, so no ticket was created.
 *
 * Together these are what let the help center "learn" without any AI: you can
 * see which articles deflect tickets, which get thumbs-down, and which topics
 * generate bugs that no article covers. It is deliberately fire-and-forget from
 * the client's perspective — a failed vote must never block reading a doc.
 */
type FeedbackKind = 'article' | 'deflection';

function parseKind(value: unknown): FeedbackKind {
  return value === 'deflection' ? 'deflection' : 'article';
}

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Cheap, high-frequency signal — keep it bounded but generous.
    await checkRateLimit(req, 'standard', current.uid);

    const tenantId = normalizeTenantId(current.tenantId);
    const data = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    const kind = parseKind(data?.kind);
    const categoryId =
      typeof data?.categoryId === 'string' ? data.categoryId.trim().slice(0, 80) : '';
    const slug = typeof data?.slug === 'string' ? data.slug.trim().slice(0, 120) : '';
    const helpful = data?.helpful === true ? true : data?.helpful === false ? false : null;
    const query = typeof data?.query === 'string' ? data.query.trim().slice(0, 300) : '';

    // An article vote needs a slug; a deflection needs the query that matched.
    if (kind === 'article' && !slug) {
      return NextResponse.json({ error: 'Missing article reference.' }, { status: 400 });
    }

    await adminDb.collection('help_feedback').add({
      tenantId,
      kind,
      categoryId: categoryId || null,
      slug: slug || null,
      helpful,
      query: query || null,
      reporter: {
        uid: current.uid,
        role: typeof current.role === 'string' ? current.role : '',
      },
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAppError(error)) {
      const { status, body, headers } = resolveErrorResponse(error);
      return NextResponse.json(body, { status, headers });
    }
    console.error('HELP_FEEDBACK_POST_ERROR', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
