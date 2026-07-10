import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * CSP violation report sink (S31-A).
 *
 * The Report-Only strict CSP set by lib/security/headers.ts points its
 * report-uri / report-to at this path. Without this endpoint, browsers would
 * POST violation reports into a 404 — zero visibility into what the strict
 * policy would block before it is enforced (S31-B).
 *
 * This accepts both report formats browsers send:
 *   - report-uri:  Content-Type application/csp-report  → { "csp-report": {...} }
 *   - report-to:   Content-Type application/reports+json → [ { body: {...} }, ... ]
 *
 * It is intentionally unauthenticated (browsers send these without app
 * credentials) and always returns 204 so a report never surfaces an error to
 * the browser. Reports are logged with a stable prefix for aggregation; there
 * is no data write, so nothing here can affect tenant data or rendering.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CspReportBody {
  'document-uri'?: string;
  documentURL?: string;
  'violated-directive'?: string;
  effectiveDirective?: string;
  'blocked-uri'?: string;
  blockedURL?: string;
  disposition?: string;
}

function summarize(body: CspReportBody | undefined): Record<string, unknown> {
  if (!body || typeof body !== 'object') return { note: 'unparsed report' };
  return {
    documentUri: body['document-uri'] || body.documentURL || null,
    directive: body['violated-directive'] || body.effectiveDirective || null,
    blockedUri: body['blocked-uri'] || body.blockedURL || null,
    disposition: body.disposition || 'report',
  };
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw) {
      const parsed = JSON.parse(raw);

      // report-to sends an array of report objects; report-uri sends { "csp-report": {...} }.
      const reports: CspReportBody[] = Array.isArray(parsed)
        ? parsed.map((r) => (r && typeof r === 'object' && 'body' in r ? r.body : r))
        : [parsed?.['csp-report']];

      for (const report of reports) {
        console.warn('[CSP-REPORT]', JSON.stringify(summarize(report)));
      }
    }
  } catch {
    // Malformed report body — ignore. Never error back to the browser.
  }

  return new NextResponse(null, { status: 204 });
}

// Some browsers preflight the report endpoint; answer permissively.
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
