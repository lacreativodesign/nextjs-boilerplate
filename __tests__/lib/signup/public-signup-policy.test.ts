import {
  getPublicSignupDenial,
  isReservedTenantIdentifier,
  readPublicSignupDecision,
  toTenantSlugBase,
} from '@/lib/signup/public-signup-policy';

const snapshot = (exists: boolean, data: unknown) => ({
  exists,
  data: () => data,
});

describe('public signup policy', () => {
  it('enables signup only for an explicit true platform switch', async () => {
    await expect(
      readPublicSignupDecision(async () => snapshot(true, { publicSignupsEnabled: true })),
    ).resolves.toEqual({ enabled: true, reason: 'enabled' });

    for (const value of [false, undefined, 'true', 1]) {
      await expect(
        readPublicSignupDecision(async () => snapshot(true, { publicSignupsEnabled: value })),
      ).resolves.toEqual({ enabled: false, reason: 'disabled' });
    }
  });

  it('fails closed for missing, malformed, or unavailable configuration', async () => {
    await expect(readPublicSignupDecision(async () => snapshot(false, {}))).resolves.toEqual({
      enabled: false,
      reason: 'configuration_missing',
    });
    await expect(readPublicSignupDecision(async () => snapshot(true, null))).resolves.toEqual({
      enabled: false,
      reason: 'configuration_missing',
    });
    await expect(
      readPublicSignupDecision(async () => {
        throw new Error('unavailable');
      }),
    ).resolves.toEqual({ enabled: false, reason: 'configuration_unavailable' });
  });

  it('returns stable denial codes without exposing configuration details', () => {
    expect(getPublicSignupDenial({ enabled: true, reason: 'enabled' })).toBeNull();
    expect(getPublicSignupDenial({ enabled: false, reason: 'disabled' })).toMatchObject({
      status: 403,
      code: 'PUBLIC_SIGNUPS_DISABLED',
    });
    expect(
      getPublicSignupDenial({ enabled: false, reason: 'configuration_unavailable' }),
    ).toMatchObject({
      status: 503,
      code: 'PUBLIC_SIGNUP_CONFIGURATION_UNAVAILABLE',
    });
  });

  it('normalizes tenant names and reserves platform, demo, and LA CREATIVO identities', () => {
    expect(toTenantSlugBase('  Example & Co.  ')).toBe('example-co');
    expect(toTenantSlugBase('---')).toBe('workspace');

    for (const value of [
      'Bizosto',
      'Bizosto Platform',
      'Bízosto Consulting',
      'BIZOSTO-DEMO',
      'LA CREATIVO',
      'LA CREATIVO LLC',
      'La Creativo Design',
      'lacreativodesign',
      'la-creativo-erp',
    ]) {
      expect(isReservedTenantIdentifier(value)).toBe(true);
    }

    expect(isReservedTenantIdentifier('Example Creative Studio')).toBe(false);
  });
});
