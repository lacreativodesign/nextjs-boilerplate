import fs from 'fs';
import path from 'path';
import { parseUtm, parseAttribution, parseConsent } from '@/lib/ingest/lead-intake';

/**
 * INTAKE-1 — the public lead endpoint accepts a bounded, known shape.
 *
 * /api/ingest/leads is the one route deliberately exposed to the open internet, and it
 * took whatever arrived:
 *
 *   - No body size limit at all. A caller could post an arbitrarily large JSON document,
 *     which either pushes a lead past the 1 MB Firestore document cap or fails the write
 *     AFTER the visitor has been told their enquiry was received.
 *   - No Content-Type check.
 *   - `utm: lead.utm || null` — the caller's object written verbatim into the lead. Any
 *     shape, any nesting, any key names, any size. Nothing downstream ever read it, so it
 *     was unvalidated caller-controlled data accumulating in storage for no purpose.
 *
 * Validating it does two things, and the second is the point. A lead document stays a
 * predictable size; and attribution becomes something a report can be built on, because
 * the field names are pinned rather than whatever each integration happened to send.
 *
 * Consent is the other half. A form capturing a name, an email and a phone number, which
 * then triggers an acknowledgement email and a sales call, needs a record that the person
 * agreed to be contacted. There was nowhere to put one. It is accepted but NOT required:
 * rejecting a lead from a form that does not send consent would silently drop a real
 * enquiry, which is worse than storing it with `consent: null`.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose describing the old shape is not the shape. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const ROUTE = 'app/api/ingest/leads/route.ts';

describe('INTAKE-1: attribution is a known set of strings', () => {
  it('keeps the five recognised UTM parameters', () => {
    expect(
      parseUtm({
        source: 'google',
        medium: 'cpc',
        campaign: 'spring',
        term: 'web design',
        content: 'ad-a',
      }),
    ).toEqual({
      source: 'google',
      medium: 'cpc',
      campaign: 'spring',
      term: 'web design',
      content: 'ad-a',
    });
  });

  it('accepts the utm_ prefixed names a query string produces', () => {
    // A form reading straight from location.search has the prefixed keys.
    expect(parseUtm({ utm_source: 'meta', utm_campaign: 'retarget' })).toEqual({
      source: 'meta',
      campaign: 'retarget',
    });
  });

  it('drops anything it does not recognise', () => {
    // The defect: an open map cannot be reported on and grows without limit.
    expect(parseUtm({ evil: 'x', nested: { deep: { deeper: 'y' } }, source: 'google' })).toEqual({
      source: 'google',
    });
  });

  it('drops non-string values rather than storing them', () => {
    expect(parseUtm({ source: { a: 1 }, medium: 42, campaign: 'ok' })).toEqual({
      campaign: 'ok',
    });
  });

  it('caps a long value instead of storing it whole', () => {
    const utm = parseUtm({ source: 'x'.repeat(5000) });
    expect(utm?.source.length).toBe(500);
  });

  it('returns null when nothing recognisable arrived', () => {
    // "none" and "empty object" are different things to read back later.
    expect(parseUtm({})).toBeNull();
    expect(parseUtm(null)).toBeNull();
    expect(parseUtm('utm_source=google')).toBeNull();
    expect(parseUtm(['source'])).toBeNull();
  });

  it('captures the ad click ids that tie a lead to a paid click', () => {
    const attribution = parseAttribution({
      attribution: { gclid: 'abc123', fbclid: 'xyz789', referrer: 'https://google.com' },
    });
    expect(attribution.gclid).toBe('abc123');
    expect(attribution.fbclid).toBe('xyz789');
    expect(attribution.referrer).toBe('https://google.com');
  });

  it('still reads utm and pageUrl from the existing lead shape', () => {
    // Anything already posting the old way keeps working.
    const attribution = parseAttribution({
      lead: { utm: { source: 'newsletter' }, pageUrl: 'https://wdd.com/contact' },
    });
    expect(attribution.utm).toEqual({ source: 'newsletter' });
    expect(attribution.currentPage).toBe('https://wdd.com/contact');
  });

  it('allows a longer cap for URLs than for tags', () => {
    const attribution = parseAttribution({
      attribution: { landingPage: `https://x.com/${'a'.repeat(5000)}` },
    });
    expect(attribution.landingPage?.length).toBe(2000);
  });
});

describe('INTAKE-1: consent is recorded, including its absence', () => {
  it('reads an explicit agreement', () => {
    const consent = parseConsent({
      consent: { contact: true, privacyPolicy: true, agreedAt: '2026-08-01T10:00:00.000Z' },
    });
    expect(consent).toEqual({
      contact: true,
      privacyPolicy: true,
      agreedAt: '2026-08-01T10:00:00.000Z',
    });
  });

  it('distinguishes declining from never being asked', () => {
    // null means the form did not ask; contact:false means the person said no. Storing
    // both as "no consent" would lose which one happened.
    expect(parseConsent({})).toBeNull();
    expect(parseConsent({ consent: { contact: false } })).toEqual({
      contact: false,
      privacyPolicy: false,
      agreedAt: null,
    });
  });

  it('treats only a literal true as agreement', () => {
    // 'yes', 1 and 'true' are the shapes a loose form sends, and none of them is a record
    // that somebody actually ticked a box.
    const consent = parseConsent({ consent: { contact: 'yes', privacyPolicy: 1 } });
    expect(consent?.contact).toBe(false);
    expect(consent?.privacyPolicy).toBe(false);
  });

  it('drops an unparseable timestamp rather than storing it', () => {
    // A malformed date looks like evidence while proving nothing.
    expect(
      parseConsent({ consent: { contact: true, agreedAt: 'last tuesday' } })?.agreedAt,
    ).toBeNull();
  });

  it('normalises a valid timestamp to ISO', () => {
    expect(parseConsent({ consent: { contact: true, agreedAt: '2026-08-01' } })?.agreedAt).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });
});

describe('INTAKE-1: the request itself is bounded', () => {
  const src = active(ROUTE);

  it('caps the body', () => {
    expect(src).toContain('MAX_BODY_BYTES');
    expect(src).toContain('64 * 1024');
    expect(src).toContain('status: 413');
  });

  it('measures what arrived rather than trusting Content-Length', () => {
    // A caller controls that header and can simply understate it.
    expect(src).toContain('await req.text()');
    expect(src).toContain("Buffer.byteLength(rawBody, 'utf8')");
    expect(src).not.toContain("headers.get('content-length')");
  });

  it('requires JSON', () => {
    expect(src).toContain('application/json');
    expect(src).toContain('status: 415');
  });

  it('rejects a JSON array or primitive, not just malformed JSON', () => {
    // `[]` parses fine and would then be read as an object with no fields.
    expect(src).toContain('Array.isArray(body)');
  });

  it('checks size before parsing, so a huge body is never deserialised', () => {
    const sizeAt = src.indexOf('MAX_BODY_BYTES');
    const parseAt = src.indexOf('JSON.parse(rawBody)');
    expect(sizeAt).toBeGreaterThan(-1);
    expect(parseAt).toBeGreaterThan(sizeAt);
  });
});

describe('INTAKE-1: the lead document stores the validated shape', () => {
  const src = active(ROUTE);

  it('never writes the raw caller object again', () => {
    expect(src).not.toContain('utm: lead.utm || null');
  });

  it('stores validated attribution and consent', () => {
    expect(src).toContain('utm: attribution.utm');
    expect(src).toContain('attribution,');
    expect(src).toContain('consent,');
  });

  it('keeps utm at the top level for anything already reading it', () => {
    // Additive, not a migration: existing readers of `lead.utm` keep working.
    const leadDoc = src.slice(src.indexOf('const leadData = {'));
    expect(leadDoc.slice(0, 800)).toContain('utm:');
  });

  it('parses before authenticating nothing — auth still comes first', () => {
    // Validation is cheap, but the tenant must still be resolved before any write.
    const authAt = src.indexOf('authenticateIngest(req)');
    const writeAt = src.indexOf('leadRef.set(leadData)');
    expect(authAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(authAt);
  });
});
