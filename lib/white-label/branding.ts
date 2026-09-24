import crypto from 'crypto';
import dns from 'dns/promises';
import { adminDb } from '@/lib/firebaseAdmin';
import { productStorageBucket } from '@/lib/storage/product-bucket';
import { normalizeLogoUrl, publicLogoHref } from '@/lib/white-label/public-logo';
import {
  generateThemeCssVariables,
  getAllowedBrandFonts,
  type ThemeMode,
  validateColorPalette,
} from '@/lib/white-label/theme';

export {
  contrastRatio,
  generateThemeCssVariables,
  getAllowedBrandFonts,
  validateColorPalette,
} from '@/lib/white-label/theme';

export type TenantBrandingSettings = {
  /** P0-07: /api/public/branding/{tenantId}/logo, or an external https URL. Never a token. */
  logoUrl: string | null;
  /** P0-07: canonical object of an uploaded logo, served by the public branding endpoint. */
  logoStoragePath?: string | null;
  tagline: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  themeMode: ThemeMode;
  customDomains: Array<{
    domain: string;
    status: 'pending' | 'verified';
    verificationToken: string;
    verifiedAt: string | null;
  }>;
  emailBranding: {
    fromName: string;
    fromEmail: string;
    emailFooter: string;
    status: 'pending' | 'verified';
    /** MAIL-1: proof the tenant controls the domain. This is what `status` reflects. */
    domainOwned: boolean;
    /** Deliverability signals. Advisory — never evidence of ownership. */
    spfValid: boolean;
    dkimValid: boolean;
    verifiedAt: string | null;
  };
  updatedAt?: string;
  updatedBy?: string;
};

export type TenantBrandingSettingsInput = Partial<Omit<TenantBrandingSettings, 'emailBranding'>> & {
  emailBranding?: Partial<TenantBrandingSettings['emailBranding']>;
};

const DEFAULT_BRANDING: TenantBrandingSettings = {
  logoUrl: null,
  tagline: null,
  primaryColor: '#2563eb',
  secondaryColor: '#1d4ed8',
  accentColor: '#14b8a6',
  fontFamily: 'Inter',
  themeMode: 'system',
  customDomains: [],
  emailBranding: {
    fromName: 'BIZOSTO ERP',
    fromEmail: '',
    emailFooter: 'Thanks,\nBIZOSTO ERP Team',
    status: 'pending',
    domainOwned: false,
    spfValid: false,
    dkimValid: false,
    verifiedAt: null,
  },
};

export function buildEmailBrandingTemplate(params: {
  branding: TenantBrandingSettings;
  html: string;
}) {
  const vars = generateThemeCssVariables(params.branding);
  return `<div style="font-family:${vars['--brand-font']};color:#111827;line-height:1.5;"><div style="border-bottom:2px solid ${vars['--erp-blue']};padding-bottom:12px;margin-bottom:16px;"><strong>${params.branding.emailBranding.fromName}</strong></div>${params.html}<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" /><div style="font-size:12px;color:#6b7280;white-space:pre-line;">${params.branding.emailBranding.emailFooter}</div></div>`;
}

export async function getTenantBranding(tenantId: string): Promise<TenantBrandingSettings> {
  const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
  const tenant = tenantSnap.data() || {};
  const stored = (tenant.whiteLabel || {}) as Partial<TenantBrandingSettings>;
  return {
    ...DEFAULT_BRANDING,
    ...stored,
    emailBranding: {
      ...DEFAULT_BRANDING.emailBranding,
      ...(stored.emailBranding || {}),
    },
    customDomains: Array.isArray(stored.customDomains) ? stored.customDomains : [],
  };
}

export async function updateTenantBranding(
  tenantId: string,
  input: TenantBrandingSettingsInput,
  updatedBy: string,
) {
  const current = await getTenantBranding(tenantId);

  // MAIL-2: changing the sender identity resets its verification.
  //
  // This spread the incoming emailBranding over the current one, which carried `status`,
  // `domainOwned` and `verifiedAt` across a change of address. So a tenant could verify
  // hello@their-own-domain.com, publishing the ownership record MAIL-1 requires, then edit
  // the address to billing@some-other-company.com and keep the verified badge — and with
  // it every downstream check that trusts the badge. Proof of control over one domain is
  // not proof of control over another.
  const nextFromEmail = String(input.emailBranding?.fromEmail ?? current.emailBranding.fromEmail)
    .trim()
    .toLowerCase();
  const senderChanged =
    nextFromEmail !==
    String(current.emailBranding.fromEmail || '')
      .trim()
      .toLowerCase();

  // P0-07: a logo URL is normalised before it is stored. A tokenized Firebase URL is
  // refused — or, when it is this tenant's own legacy logo, migrated to the public
  // branding endpoint with its token dropped — so saving branding can never write a
  // bearer URL, including by re-submitting the value a legacy document already holds.
  const logo = input.logoUrl !== undefined ? normalizeLogoUrl(input.logoUrl, tenantId) : undefined;

  const next: TenantBrandingSettings = {
    ...current,
    ...input,
    ...(logo
      ? {
          logoUrl: logo.logoUrl,
          logoStoragePath: logo.logoUrl
            ? (logo.logoStoragePath ?? current.logoStoragePath ?? null)
            : null,
        }
      : {}),
    emailBranding: {
      ...current.emailBranding,
      ...(input.emailBranding || {}),
      ...(senderChanged
        ? { status: 'pending' as const, domainOwned: false, verifiedAt: null }
        : {}),
    },
    customDomains: Array.isArray(input.customDomains) ? input.customDomains : current.customDomains,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  validateColorPalette(next.primaryColor, next.secondaryColor, next.accentColor);
  if (!getAllowedBrandFonts().includes(next.fontFamily)) {
    throw new Error('Unsupported font family.');
  }

  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .set(
      {
        whiteLabel: next,
        brand: {
          ...(next.logoUrl ? { logoUrl: next.logoUrl } : {}),
        },
        updatedAt: next.updatedAt,
        updatedBy,
      },
      { merge: true },
    );

  return next;
}

/**
 * Stores a tenant logo and publishes it through the public branding endpoint.
 *
 * P0-07: this used to write a `firebaseStorageDownloadTokens` token onto the object,
 * persist the resulting tokenized Firebase URL as `logoUrl`, and resolve the bucket with
 * a bare `adminStorage.bucket()` — which, with no `storageBucket` on the Admin app, is not
 * the canonical bucket at all. Now the bucket is the canonical one, the object carries no
 * token, and the tenant stores the object's path plus a stable Bizosto URL for it. See
 * lib/white-label/public-logo.ts for why logos are the one deliberately public object.
 */
export async function uploadTenantLogo(
  tenantId: string,
  params: { dataUrl: string; contentType?: string },
) {
  const matches = params.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid logo payload.');
  const mime = matches[1];
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(mime)) {
    throw new Error('Unsupported logo format.');
  }

  const buffer = Buffer.from(matches[2], 'base64');
  if (buffer.byteLength === 0) throw new Error('Invalid logo payload.');
  if (buffer.byteLength > 2 * 1024 * 1024) {
    throw new Error('Logo exceeds 2MB limit.');
  }

  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1].replace('+xml', '');
  const storagePath = `tenants/${tenantId}/branding/logo.${ext}`;
  const file = productStorageBucket().file(storagePath);

  await file.save(buffer, {
    contentType: mime,
    resumable: false,
    metadata: {
      cacheControl: 'public, max-age=300',
      // Deliberately no firebaseStorageDownloadTokens. The Admin SDK adds none.
      metadata: { tenantId, purpose: 'tenant-logo' },
    },
  });

  // The generation versions the public URL, so a replaced logo is not served from cache.
  const [metadata] = await file.getMetadata();
  const logoUrl = publicLogoHref(tenantId, String(metadata?.generation ?? ''));

  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .set(
      {
        whiteLabel: { logoUrl, logoStoragePath: storagePath },
        brand: { logoUrl },
      },
      { merge: true },
    );
  return { logoUrl, storagePath };
}

export async function verifyCustomDomain(domain: string, verificationToken: string) {
  const cleanDomain = String(domain || '')
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleanDomain)) {
    throw new Error('Invalid domain.');
  }

  const recordName = `_bizosto-verify.${cleanDomain}`;
  const txtRecords = await dns.resolveTxt(recordName).catch(() => [] as string[][]);
  const flattened = txtRecords.map((entry) => entry.join('').trim());
  const expected = `bizosto-verification=${verificationToken}`;
  return {
    verified: flattened.includes(expected),
    recordName,
    expected,
    found: flattened,
  };
}

/**
 * MAIL-1: verifying a sender address means proving the tenant controls its domain.
 *
 * This used to return `verified: spfValid && dkimValid` — an SPF record exists on the
 * domain, and something answers at `default._domainkey`. Neither fact says anything about
 * the tenant. Every domain on Google Workspace or Microsoft 365 publishes SPF, and
 * `default` is the stock DKIM selector, so a tenant could type `billing@some-other-
 * company.com`, click Verify, and be told the address was verified. The check proved that
 * SOMEBODY had configured mail for that domain — not that this tenant had, and not that
 * Bizosto was authorised to send as it.
 *
 * The correct pattern was already twenty lines above: verifyCustomDomain() asks for a
 * per-tenant token in a `_bizosto-verify` TXT record, which only someone with control of
 * the domain's DNS can publish. Sender verification now uses the same proof, with the
 * same token derivation, so a tenant cannot claim an address on a domain it does not run.
 *
 * SPF and DKIM are still reported, because they genuinely matter — but as DELIVERABILITY
 * signals, advisory information about whether mail will reach an inbox. They are no
 * longer treated as evidence of ownership, because they are not.
 */
export async function verifyEmailSender(fromEmail: string, verificationToken: string) {
  const cleanEmail = String(fromEmail || '')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Invalid sender email.');
  }

  const domain = cleanEmail.split('@')[1];

  // Ownership: the same challenge the custom-domain flow uses. Only someone who controls
  // this domain's DNS can publish a record containing this tenant's token.
  const recordName = `_bizosto-verify.${domain}`;
  const ownershipRecords = await dns.resolveTxt(recordName).catch(() => [] as string[][]);
  const flattenedOwnership = ownershipRecords.map((entry) => entry.join('').trim());
  const expected = `bizosto-verification=${verificationToken}`;
  const domainOwned = flattenedOwnership.includes(expected);

  // Deliverability: advisory only. Useful to show a tenant, never proof of anything.
  const spfRecords = await dns.resolveTxt(domain).catch(() => [] as string[][]);
  const flattenedSpf = spfRecords.map((entry) => entry.join(''));
  const spfValid = flattenedSpf.some((record) => record.toLowerCase().startsWith('v=spf1'));

  const dkimHost = `default._domainkey.${domain}`;
  const dkimRecords = await dns.resolveTxt(dkimHost).catch(() => [] as string[][]);
  const flattenedDkim = dkimRecords.map((entry) => entry.join(''));
  const dkimValid = flattenedDkim.some(
    (record) => record.toLowerCase().includes('k=rsa') || record.toLowerCase().includes('v=dkim1'),
  );

  return {
    domainOwned,
    spfValid,
    dkimValid,
    // Ownership alone decides this. A domain with perfect SPF and DKIM that the tenant
    // does not control is not verified, and never was.
    verified: domainOwned,
    recordName,
    expected,
    ownershipRecords: flattenedOwnership,
    spfRecords: flattenedSpf,
    dkimRecords: flattenedDkim,
  };
}

export function createDomainVerificationToken(tenantId: string, domain: string) {
  return crypto.createHash('sha256').update(`${tenantId}:${domain}`).digest('hex').slice(0, 32);
}
