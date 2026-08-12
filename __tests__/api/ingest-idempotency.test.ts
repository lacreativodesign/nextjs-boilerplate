import fs from 'fs';
import path from 'path';

/**
 * IDEM-1 — a retried submission returns the original lead.
 *
 * A website form posts over a network that drops requests. The browser retries, the
 * serverless platform retries, the visitor double-clicks Send. INGEST-1 made these
 * requests reach the route for the first time, which is what made this worth fixing:
 * before, every retry produced one of two wrong answers.
 *
 *   - Retried after 60 seconds: a SECOND lead for the same person. Sales calls them
 *     twice, and the pipeline count is wrong.
 *   - Retried within 60 seconds: HTTP 409 with `ok: false`. The website reads that as a
 *     failed submission and shows the visitor an error — while the lead sat in the CRM
 *     the whole time. That is the worst of the three: a captured lead the sender believes
 *     was lost, and a real person told to try again.
 *
 * The correct pattern was already in the same directory. /api/ingest/orders anchors on a
 * deterministic document id and answers a repeat with `ok: true, duplicate: true` and the
 * ORIGINAL id. Leads now does the same, with two differences that matter:
 *
 *   - The claim uses create(), which fails if the document exists, so two concurrent
 *     retries cannot both write a lead. Orders reads-then-writes and has a race window.
 *   - The key is hashed into the id rather than character-sanitised. Sanitising means
 *     `a/b` and `a_b` collapse to the same id, so one submission can shadow an unrelated
 *     one. A hash cannot collide that way.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose describing the old contract is not the contract. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const LEADS = 'app/api/ingest/leads/route.ts';
const SETTINGS_PAGE = 'app/admin/settings/api-key/page.tsx';

describe('IDEM-1: a captured lead is never reported as a failure', () => {
  const src = active(LEADS);

  it('never answers a duplicate with 409', () => {
    // The lead exists. Telling the sender it does not is what turns a real person away.
    expect(src).not.toContain("error: 'Duplicate lead detected.'");
    expect(src).not.toMatch(/status:\s*409/);
  });

  it('returns the original lead id on a repeat', () => {
    expect(src).toContain('duplicate: true');
    expect(src).toContain('leadId: existing.leadId');
    expect(src).toContain('leadId: duplicate.id');
  });

  it('marks a first-time submission as not a duplicate, so the flag is always present', () => {
    // A caller should not have to infer absence.
    expect(src).toContain('duplicate: false');
  });
});

describe('IDEM-1: an explicit key gives an exact-once guarantee', () => {
  const src = active(LEADS);

  it('accepts the standard header', () => {
    expect(src).toContain("req.headers.get('idempotency-key')");
  });

  it('also accepts a submissionId in the body, for forms that cannot set headers', () => {
    expect(src).toContain('body.submissionId');
  });

  it('claims the key atomically, so concurrent retries cannot both write', () => {
    // create() fails when the document exists; read-then-write would race.
    expect(src).toContain('claimRef.create(');
    expect(src).not.toMatch(/claimRef\.get\(\)[\s\S]{0,200}claimRef\.set\(/);
  });

  it('treats ALREADY_EXISTS as a replay rather than an error', () => {
    expect(src).toMatch(/code === 6 \|\| code === 'already-exists'/);
  });

  it('rethrows any other failure instead of silently accepting the lead twice', () => {
    const claimBlock = src.slice(src.indexOf('claimRef.create('), src.indexOf('} else {'));
    expect(claimBlock).toContain('throw err');
  });

  it('hashes the key into the document id, so two keys cannot collide', () => {
    expect(src).toContain("crypto.createHash('sha256')");
    expect(src).toContain('idempotencyDocId');
    // The sanitise-by-replace approach orders uses would collapse distinct keys.
    expect(src).not.toMatch(/idempotencyKey.*\.replace\(\/\[\^A-Za-z0-9/);
  });

  it('scopes the key to the tenant, so one tenant cannot shadow another', () => {
    const fn = src.slice(src.indexOf('function idempotencyDocId'));
    expect(fn.slice(0, 300)).toContain('${tenantId}:${key}');
  });

  it('links the claim to the lead only after the lead exists', () => {
    // A claim pointing at a lead that was never written makes every retry return a
    // dangling reference.
    const writeAt = src.indexOf('await leadRef.set(leadData)');
    const linkAt = src.indexOf('leadId: leadRef.id, completedAt');
    expect(writeAt).toBeGreaterThan(-1);
    expect(linkAt).toBeGreaterThan(writeAt);
  });

  it('releases the claim when the write fails, so a retry can still succeed', () => {
    // Without this, one failure poisons that key permanently.
    const catchBlock = src.slice(src.indexOf('} catch (error) {'));
    expect(catchBlock).toContain('claimRef.delete()');
  });
});

describe('IDEM-1: the heuristic remains only for callers that send no key', () => {
  const src = active(LEADS);

  it('keeps the short-window check as a fallback', () => {
    expect(src).toContain('DEDUPE_WINDOW_MS');
  });

  it('skips the fallback entirely when a key is present', () => {
    // The key is authoritative; running both would let the heuristic override an exact
    // answer with a guess.
    expect(src).toMatch(/if \(idempotencyKey\)[\s\S]*\} else \{[\s\S]*DEDUPE_WINDOW_MS/);
  });

  it('still scopes the fallback query to the tenant', () => {
    expect(src).toContain('queryWithTenant(');
  });
});

describe('IDEM-1: tenants are told how to use it', () => {
  it('the settings page documents the header', () => {
    const page = read(SETTINGS_PAGE);
    expect(page).toContain('Idempotency-Key');
    expect(page).toContain('returns the original lead');
  });
});
