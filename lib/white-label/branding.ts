import crypto from 'crypto';
import dns from 'dns/promises';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
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
  logoUrl: string | null;
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
  const next: TenantBrandingSettings = {
    ...current,
    ...input,
    emailBranding: {
      ...current.emailBranding,
      ...(input.emailBranding || {}),
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

export async function uploadTenantLogo(
  tenantId: string,
  params: { dataUrl: string; contentType: string },
) {
  const matches = params.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid logo payload.');
  const mime = matches[1];
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(mime)) {
    throw new Error('Unsupported logo format.');
  }

  const buffer = Buffer.from(matches[2], 'base64');
  if (buffer.byteLength > 2 * 1024 * 1024) {
    throw new Error('Logo exceeds 2MB limit.');
  }

  const token = crypto.randomUUID();
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1].replace('+xml', '');
  const storagePath = `tenants/${tenantId}/branding/logo.${ext}`;
  const bucket = adminStorage.bucket();
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    contentType: mime,
    resumable: false,
    metadata: {
      cacheControl: 'public,max-age=3600',
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const encodedPath = encodeURIComponent(storagePath);
  const logoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .set({ whiteLabel: { logoUrl }, brand: { logoUrl } }, { merge: true });
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

export async function verifyEmailSender(fromEmail: string) {
  const cleanEmail = String(fromEmail || '')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Invalid sender email.');
  }

  const domain = cleanEmail.split('@')[1];
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
    spfValid,
    dkimValid,
    verified: spfValid && dkimValid,
    spfRecords: flattenedSpf,
    dkimRecords: flattenedDkim,
  };
}

export function createDomainVerificationToken(tenantId: string, domain: string) {
  return crypto.createHash('sha256').update(`${tenantId}:${domain}`).digest('hex').slice(0, 32);
}
