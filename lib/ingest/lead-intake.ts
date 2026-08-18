/**
 * Lead intake validation (INTAKE-1).
 *
 * The lead endpoint stored `utm: lead.utm || null` — whatever object arrived, written
 * verbatim into the lead document. Any shape, any nesting, any key names, any size. It is
 * caller-controlled data going straight into storage, and nothing downstream ever read it,
 * so it was pure unvalidated accumulation on the one endpoint that is deliberately exposed
 * to the public internet.
 *
 * Two things follow from validating it instead, and the second matters more:
 *
 *   - A lead document stays a predictable size. Firestore caps a document at 1 MB, so an
 *     unbounded blob eventually fails the write AFTER the visitor has been told their
 *     enquiry was received.
 *   - Attribution becomes usable. An agency running ads needs to know which campaign
 *     produced a lead; a free-form object nobody validates is not something a report can
 *     be built on. Pinning the field names is what makes them queryable later.
 *
 * Consent is the other half. A website form that captures a name, an email and a phone
 * number, and then triggers an acknowledgement email and a sales call, needs a record that
 * the person agreed to be contacted — what they agreed to, and when. There was nowhere to
 * put that. It is the tenant's legal exposure rather than Bizosto's, which is exactly why
 * the platform should make it easy to record rather than leave to each integration.
 *
 * Consent is accepted but NOT required. Requiring it would reject leads from any form
 * already posting without it, and silently dropping a real enquiry is worse than storing
 * one with `consent: null`. Absence is recorded explicitly so a tenant can see which leads
 * lack it rather than having to infer it from a missing field.
 */

/** Caps chosen so a full attribution set stays far inside the Firestore document limit. */
const MAX_FIELD_LENGTH = 500;
const MAX_URL_LENGTH = 2000;

/**
 * The attribution fields worth keeping.
 *
 * A closed list rather than "whatever arrived": an open map cannot be reported on, and
 * grows without limit. Anything not named here is dropped rather than stored.
 */
const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;

export type LeadAttribution = {
  utm: Record<string, string> | null;
  /** Where the visitor landed first, and the page the form sat on. */
  landingPage: string | null;
  currentPage: string | null;
  referrer: string | null;
  /** Ad-platform click identifiers. The only reliable way to tie a lead to a paid click. */
  gclid: string | null;
  fbclid: string | null;
};

export type LeadConsent = {
  /** The person agreed to be contacted about this enquiry. */
  contact: boolean;
  /** They were shown a privacy policy. */
  privacyPolicy: boolean;
  /** When they agreed, as reported by the form. */
  agreedAt: string | null;
} | null;

function cleanString(value: unknown, maxLength = MAX_FIELD_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * Keeps only the five recognised UTM parameters, as trimmed strings.
 *
 * Returns null rather than an empty object when nothing recognisable arrived, so a lead
 * with no attribution reads as "none" rather than "empty".
 */
export function parseUtm(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const utm: Record<string, string> = {};

  for (const key of UTM_KEYS) {
    // Accept both `source` and `utm_source`: a form reading straight from the query string
    // will have the prefixed names, one building an object usually will not.
    const parsed = cleanString(raw[key]) || cleanString(raw[`utm_${key}`]);
    if (parsed) utm[key] = parsed;
  }

  return Object.keys(utm).length ? utm : null;
}

export function parseAttribution(body: Record<string, unknown>): LeadAttribution {
  const lead = (body.lead || {}) as Record<string, unknown>;
  const attribution = (body.attribution || {}) as Record<string, unknown>;

  return {
    utm: parseUtm(attribution.utm ?? lead.utm),
    // `pageUrl` is what the existing contract calls the form's page, so it stays accepted.
    landingPage: cleanString(attribution.landingPage, MAX_URL_LENGTH),
    currentPage:
      cleanString(attribution.currentPage, MAX_URL_LENGTH) ||
      cleanString(lead.pageUrl, MAX_URL_LENGTH),
    referrer: cleanString(attribution.referrer, MAX_URL_LENGTH),
    gclid: cleanString(attribution.gclid),
    fbclid: cleanString(attribution.fbclid),
  };
}

/**
 * Reads a consent block, or returns null when none was sent.
 *
 * A missing block and a block saying "no" are different facts and are stored differently:
 * null means the form never asked, `contact: false` means the person declined.
 */
export function parseConsent(body: Record<string, unknown>): LeadConsent {
  const consent = body.consent;
  if (!consent || typeof consent !== 'object' || Array.isArray(consent)) return null;

  const raw = consent as Record<string, unknown>;
  const agreedAt = cleanString(raw.agreedAt, 40);
  const parsedDate = agreedAt ? new Date(agreedAt) : null;

  return {
    contact: raw.contact === true,
    privacyPolicy: raw.privacyPolicy === true,
    // Normalised, and dropped entirely if unparseable — a malformed timestamp is worse
    // than none, because it looks like evidence while proving nothing.
    agreedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
  };
}
