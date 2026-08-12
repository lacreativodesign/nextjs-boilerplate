/**
 * Billing mode (COMP-1).
 *
 * Bizosto has always assumed every workspace is either paying Stripe or on its way to
 * paying Stripe. That is not true, and the gap showed up as soon as MRR-1 made revenue
 * honest: Bizosto's own workspace, the demo tenant, and any workspace granted access by
 * hand all landed in a bucket called `unbilledActiveTenants` — an anomaly, when they are
 * in fact a legitimate and permanent state.
 *
 * `billingMode` makes that state explicit:
 *
 *   - 'stripe' — an ordinary customer. Stripe is the source of truth for access, dunning
 *     and revenue. This is the default for anything not marked otherwise, so existing
 *     tenants keep exactly the behaviour they have today.
 *   - 'comped' — access is granted by Bizosto and there is no external payment. The
 *     workspace never enters the dunning ladder, never receives trial or billing email,
 *     never opens Stripe checkout, and never contributes a cent to MRR.
 *
 * A comped workspace is NOT a discount and NOT a free trial. It is an accounting fact
 * about who pays, kept deliberately separate from `plan`, which stays the answer to what
 * the workspace can do. An internal Enterprise tenant therefore holds
 * `plan: 'enterprise'` with full entitlement AND `billingMode: 'comped'` with zero
 * revenue, and neither field has to lie about the other.
 *
 * Every comp is attributable. A workspace that pays nothing is a commercial decision, so
 * the reason, the operator who granted it and the timestamp are required — a comp with no
 * recorded reason is indistinguishable from a billing bug six months later.
 */

export type BillingMode = 'stripe' | 'comped';

/** Why a workspace is comped. Reporting needs these separated, not lumped together. */
export type CompedType = 'internal' | 'promotional' | 'partner' | 'support';

export type CompedGrant = {
  type: CompedType;
  /** Free text, required. "Bizosto's own workspace", "design partner through Q3". */
  reason: string;
  grantedByUid: string;
  grantedAt: string;
  /** ISO date, or null for an open-ended comp such as an internal workspace. */
  expiresAt: string | null;
};

export const BILLING_MODES: readonly BillingMode[] = ['stripe', 'comped'] as const;
export const COMPED_TYPES: readonly CompedType[] = [
  'internal',
  'promotional',
  'partner',
  'support',
] as const;

/**
 * Resolves a tenant's billing mode.
 *
 * Defaults to 'stripe', so a document written before this field existed behaves exactly
 * as it does today. Being comped is an explicit, recorded decision — never an inference
 * from missing data.
 */
export function resolveBillingMode(value: unknown): BillingMode {
  return String(value || '').toLowerCase() === 'comped' ? 'comped' : 'stripe';
}

/** Convenience for the many call sites that only care whether money is involved. */
export function isComped(tenantData: { billingMode?: unknown } | null | undefined): boolean {
  return resolveBillingMode(tenantData?.billingMode) === 'comped';
}

/**
 * Whether a comp has lapsed.
 *
 * An expired comp does NOT silently start charging anyone — nothing here mutates state.
 * It reports the fact so an operator can convert the workspace deliberately. A promotional
 * comp that quietly turned into a bill would be worse than one that quietly kept running.
 */
export function isCompExpired(grant: CompedGrant | null | undefined, now = new Date()): boolean {
  if (!grant?.expiresAt) return false;
  const expiry = new Date(grant.expiresAt);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() <= now.getTime();
}

export type CompedGrantValidation = { ok: true; grant: CompedGrant } | { ok: false; error: string };

/**
 * Validates an operator-supplied comp before it is written.
 *
 * Fails closed on every field. A comp is a decision to forgo revenue, so a malformed one
 * must be rejected outright rather than half-written — a workspace holding
 * `billingMode: 'comped'` with no reason and no grantor is exactly the record nobody can
 * account for later.
 */
export function validateCompedGrant(input: unknown, grantedByUid: string): CompedGrantValidation {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'A comped grant requires a type, a reason and an expiry.' };
  }

  const raw = input as Record<string, unknown>;

  const type = String(raw.type || '').toLowerCase();
  if (!COMPED_TYPES.includes(type as CompedType)) {
    return { ok: false, error: `comped.type must be one of: ${COMPED_TYPES.join(', ')}.` };
  }

  const reason = String(raw.reason || '').trim();
  if (!reason) {
    return { ok: false, error: 'A comped grant requires a reason.' };
  }
  if (reason.length > 500) {
    return { ok: false, error: 'A comped reason must be 500 characters or fewer.' };
  }

  // `expiresAt` must be present but may be null: an internal workspace has no end date,
  // and forcing an arbitrary one would just create a future outage.
  let expiresAt: string | null = null;
  if (raw.expiresAt !== null && raw.expiresAt !== undefined && raw.expiresAt !== '') {
    const parsed = new Date(String(raw.expiresAt));
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: 'comped.expiresAt must be an ISO date or null.' };
    }
    expiresAt = parsed.toISOString();
  }

  return {
    ok: true,
    grant: {
      type: type as CompedType,
      reason,
      grantedByUid,
      grantedAt: new Date().toISOString(),
      expiresAt,
    },
  };
}
