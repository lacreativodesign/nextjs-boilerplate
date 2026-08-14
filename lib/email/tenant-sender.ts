import { adminDb } from '@/lib/firebaseAdmin';

/**
 * Tenant sender identity (MAIL-4).
 *
 * Mail that Bizosto sends falls into two kinds, and they need different envelopes:
 *
 *   - Platform mail — OTP codes, password setup, subscription billing, app notifications
 *     to a tenant's own staff. Bizosto is genuinely the sender. It uses the platform
 *     identity and nothing here applies.
 *   - Tenant business mail — an invoice, a payment reminder, a lead acknowledgement. The
 *     recipient is the TENANT's customer, who has no relationship with Bizosto and in most
 *     cases has never heard of it. Mail arriving from "Bizosto" about an invoice from
 *     someone else reads as a phishing attempt, discloses the tenant's supplier, and sends
 *     replies to an inbox the tenant cannot read.
 *
 * MAIL-3 worked this out for invoice reminders and inlined it there. Two more customer-
 * facing send sites need exactly the same decision, and three copies of a security-adjacent
 * rule is how they drift — so the decision lives here once.
 *
 * The resolution is deliberately two-tier:
 *
 *   1. A verified tenant sender (MAIL-1 proved domain control, MAIL-2 keeps the proof
 *      honest) is used as-is. Full white-label: Bizosto does not appear at all.
 *   2. Otherwise the platform ADDRESS is kept — it is the only domain Bizosto is
 *      authorised to send from — while the tenant's NAME becomes the display name and
 *      Reply-To points at the tenant.
 *
 * Tier 2 is not the silent Bizosto-sender fallback MAIL-2 forbids. Claiming a name is not
 * claiming a domain: the envelope stays truthful about which service transmitted the
 * message, while the recipient learns which company is actually writing to them. Spoofing
 * would be putting the tenant's unproven domain in `from`, and that never happens here.
 */

export type TenantEmailIdentity = {
  /** Only ever set from a verified sender. Absent means "use the platform address". */
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
};

/** The parts of a tenant document this decision depends on. */
export type TenantSenderSource = {
  name?: string;
  whiteLabel?: {
    emailBranding?: {
      fromName?: string;
      fromEmail?: string;
      status?: string;
      domainOwned?: boolean;
    };
  };
};

/**
 * Whether a tenant has proved it controls the domain it wants to send from.
 *
 * Both conditions are required. `status` alone could be set by some future code path that
 * does not prove control; `domainOwned` is the flag MAIL-1 writes only after the DNS
 * challenge succeeds.
 */
export function hasVerifiedSender(tenant: TenantSenderSource | null | undefined): boolean {
  const branding = tenant?.whiteLabel?.emailBranding;
  return branding?.status === 'verified' && branding?.domainOwned === true;
}

/**
 * How to address one message from a tenant to its own customer.
 *
 * Returns the fields to spread into sendEmail(). An unverified tenant gets a name and a
 * Reply-To but no `fromEmail`, so the provider falls back to the platform address.
 */
export function resolveTenantSender(
  tenant: TenantSenderSource | null | undefined,
): TenantEmailIdentity {
  const branding = tenant?.whiteLabel?.emailBranding;
  const tenantAddress = String(branding?.fromEmail || '').trim();
  const displayName = branding?.fromName || tenant?.name || undefined;

  const identity: TenantEmailIdentity = {};

  if (hasVerifiedSender(tenant) && tenantAddress) {
    identity.fromEmail = tenantAddress;
  }
  if (displayName) {
    identity.fromName = displayName;
  }
  // Reply-To carries the tenant's address whether or not the domain is verified: it routes
  // replies and asserts no identity, so it cannot be used to impersonate anyone. Getting a
  // customer's reply to the right company is worth more than withholding it.
  if (tenantAddress) {
    identity.replyTo = tenantAddress;
  }

  return identity;
}

/**
 * Loads a tenant and resolves its sender in one step, for call sites that hold only an id.
 *
 * Never throws: a message that cannot resolve a tenant still goes out under the platform
 * identity rather than failing. Losing an invoice because a branding lookup failed would
 * be a worse outcome than sending it with a plain sender.
 */
export async function resolveTenantSenderById(
  tenantId: string | null | undefined,
): Promise<TenantEmailIdentity> {
  const id = String(tenantId || '').trim();
  if (!id) return {};

  try {
    const snap = await adminDb.collection('tenants').doc(id).get();
    if (!snap.exists) return {};
    return resolveTenantSender(snap.data() as TenantSenderSource);
  } catch {
    // Logged without the tenant id: this runs on paths that carry customer data.
    console.error('[EMAIL] failed to resolve tenant sender identity');
    return {};
  }
}
