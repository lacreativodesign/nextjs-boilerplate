import { resolvePlanModules } from '@/lib/tenant/plan-access';

// The subscription webhook now writes resolvePlanModules(plan) to a tenant's
// modules/modulesEnabled on every plan change. These assertions guarantee each tier
// resolves to a DISTINCT, correct module map — i.e. an upgrade/downgrade actually
// changes module access rather than leaving it stale.
describe('resolvePlanModules — plan/module lockstep', () => {
  it('starter excludes finance, production, approvals, hr', () => {
    const m = resolvePlanModules('starter');
    expect(m.finance).toBe(false);
    expect(m.production).toBe(false);
    expect(m.approvals).toBe(false);
    expect(m.hr).toBe(false);
    expect(m.crm).toBe(true);
  });

  it('pro enables finance/production/approvals but not hr', () => {
    const m = resolvePlanModules('pro');
    expect(m.finance).toBe(true);
    expect(m.production).toBe(true);
    expect(m.approvals).toBe(true);
    expect(m.hr).toBe(false);
    expect(m.client_stripe_connect).toBe(false);
  });

  it('enterprise enables hr and client_stripe_connect', () => {
    const m = resolvePlanModules('enterprise');
    expect(m.hr).toBe(true);
    expect(m.client_stripe_connect).toBe(true);
  });

  it('tiers produce different maps (upgrade/downgrade changes access)', () => {
    expect(resolvePlanModules('starter')).not.toEqual(resolvePlanModules('pro'));
    expect(resolvePlanModules('pro')).not.toEqual(resolvePlanModules('enterprise'));
  });
});
